# Implementation 19 — Shareable Link UI + Public Read-Only Snapshot View

> **Wave:** 4
> **Depends on:** 01, 05, 11
> **Deploys:** web restart only

---

## Goal

Build the two surfaces that complete the read-only sharing story:

1. **Authenticated UI** — the "issue / list / revoke shareable links" surface owned by snapshot publishers (Owner / Principal / Vice Principal). Lives inside the school shell at `/finance/budgeting/models/[id]/share`.
2. **Public open route** — the read-only snapshot renderer for board members and external recipients who don't have logins. Lives at `/[locale]/finance/budgeting/share/[token]` — **outside** the `(school)` group so no auth middleware redirects.

Per `PLAN.md §11.2`: links expire (no infinite links), can be password-protected, can selectively expose alternative scenarios, and never expose household / student / staff PII. The public page mirrors the workspace's KPI strip + scenario compare + line-item table read-only.

## What to change

### 1. Authenticated route — `apps/web/src/app/[locale]/(school)/finance/budgeting/models/[id]/share/page.tsx` — NEW

`'use client'`. Lists existing shareable links for a model and lets the user issue new ones.

Page layout:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Breadcrumb: Finance / Budgeting / Models / <model name> / Shared links│
├──────────────────────────────────────────────────────────────────────┤
│  Header                                                                │
│  - Title: "Shared links — <model name>"                                │
│  - Subtitle: "Issue read-only links to board members and external      │
│    recipients. Links expire and can be password-protected."            │
│  - "+ Issue new shareable link" button (primary, end-aligned)          │
├──────────────────────────────────────────────────────────────────────┤
│  Active links section                                                  │
│  ┌─ LinkRow ─────────────────────────────────────────────────────┐    │
│  │ <token last 8 chars> · expires in 22 days · viewed 3 times      │    │
│  │ Last viewed 4 hours ago                                         │    │
│  │ Snapshot v3 · Scenarios: Base, Cautious, Growth                 │    │
│  │ [Copy URL]  [Revoke]                                             │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│  ...                                                                   │
├──────────────────────────────────────────────────────────────────────┤
│  Inactive links section (collapsible, default collapsed)               │
│  Revoked + expired links here, read-only.                              │
└──────────────────────────────────────────────────────────────────────┘
```

State:

```ts
type ShareableLinkRow = {
  id: string;
  token: string;
  parent_snapshot_id: string;
  snapshot_version: number;
  expires_at: string;
  has_password: boolean;
  scenarios_visible: string[]; // ['base', 'cautious', 'growth']
  view_count: number;
  last_viewed_at: string | null;
  revoked_at: string | null;
  created_at: string;
  created_by_user_name: string;
};
```

Initial fetch: `GET /v1/budgeting/financial-models/:id/shareable-links` returns `{ data: ShareableLinkRow[] }`. Sort: active (not revoked, not expired) first by `created_at desc`, then inactive.

Permission gate: the entire page requires `budgeting.share`. Read users see a "You don't have permission to manage shareable links" empty state with a back link. The "+ Issue" button is hidden when the user lacks `budgeting.share`. Revoke action requires `budgeting.share`.

Empty state (when no links exist): centred illustration + heading "No shareable links yet" + description + "Issue first link" CTA.

### 2. `_components/issue-link-modal.tsx` — NEW

shadcn `Dialog`. Becomes a `Sheet` on mobile.

Props:

```ts
type Props = {
  open: boolean;
  onClose: () => void;
  modelId: string;
  snapshots: Array<{ id: string; version_number: number; published_at: string }>;
  scenarios: Array<{ id: string; name: string }>;
  defaultMaxDays: number; // from BudgetingTenantPreferences
  onCreated: (link: { token: string; url: string; expires_at: string }) => void;
};
```

Form (`react-hook-form` + `zodResolver(issueLinkFormSchema)`):

```ts
const issueLinkFormSchema = z.object({
  parent_snapshot_id: z.string().uuid(),
  expires_in_days: z.number().int().min(1).max(365),
  password: z.string().min(8).max(64).optional().nullable(),
  scenarios_visible: z.array(z.enum(['base', 'alt-1', 'alt-2', 'alt-3'])).min(1),
});
```

Fields, in order:

1. **Snapshot picker** — radio cards listing `Snapshot v<N> · Published <date>`. Defaults to the latest. Disabled when only one snapshot exists (auto-select).
2. **Expiry** — radio chips for 7 / 14 / 30 / 90 days, with a "Custom" option that reveals a number input (clamped 1..`tenant.shareable_link_max_days`).
3. **Password (optional)** — labeled "Add a password (optional)". Toggle revealed by clicking "Set password". Show / hide eye icon. Min 8 chars, max 64. Helper text: "Recipients will need to enter this password to view the snapshot."
4. **Scenarios visible** — multi-select checkboxes. Base is always checked and disabled. Each alternative scenario gets its own checkbox. Helper text: "Recipients will only see the scenarios you check here."

Footer: [Cancel] [Issue link] (primary). Submit button shows spinner while in flight.

On submit:

```ts
const response = await apiClient<{ data: { token: string; url: string; expires_at: string } }>(
  `/api/v1/budgeting/financial-models/${modelId}/snapshots/${parent_snapshot_id}/links`,
  {
    method: 'POST',
    body: JSON.stringify({
      expires_in_days,
      password: password ?? null,
      scenarios_visible,
    }),
  },
);
const link = unwrap(response);
onCreated(link);
```

After creation, the modal swaps to a "**Link issued**" success view with:

- The full URL displayed in a read-only input.
- A "Copy URL" button (uses `navigator.clipboard.writeText`).
- A "Done" button to close the modal.
- A reminder banner: "Anyone with this URL can view the snapshot until it expires. Treat it like a confidential document."

The full URL format (per `PLAN.md §11.2`):

```
https://<tenant-subdomain>.edupod.app/finance/budgeting/share/<token>
```

The backend returns the full URL pre-built, so the frontend doesn't reconstruct it.

A11y:

- All form fields have associated `<Label>` elements.
- Password toggle has `aria-pressed` for the visibility state.
- Scenarios multi-select uses a `<fieldset><legend>` semantic group.
- After link issued, focus moves to the URL input (auto-selected) so the user can immediately copy.

### 3. `_components/link-row.tsx` — NEW

A list item component. Props:

```ts
type Props = {
  link: ShareableLinkRow;
  baseUrl: string; // computed once at page-mount from window.location
  canRevoke: boolean;
  onRevoke: (linkId: string) => Promise<void>;
};
```

Visual treatment:

- Active links: `bg-card border-border` with regular text colors.
- Expired: `bg-muted/50` with reduced text contrast and an "Expired" pill.
- Revoked: same muted treatment with a "Revoked" pill.

Information density:

```
<token last 8 chars> · <expiry status>
viewed <N> times · last viewed <relative time>
Snapshot v<N> · Scenarios: <comma-list>
[Copy URL] [Revoke]    (or [Copy URL — disabled] when expired/revoked)
```

The "Copy URL" button:

- Construct the URL as `${baseUrl}/finance/budgeting/share/${link.token}`.
- Click → `navigator.clipboard.writeText(url)` → toast "URL copied to clipboard".
- Disabled when revoked or expired.

The "Revoke" button:

- Confirmation modal: "Are you sure you want to revoke this link? Anyone trying to access it will see an error message. This cannot be undone."
- On confirm, calls `DELETE /v1/budgeting/financial-models/:id/shareable-links/:linkId` (revoke = soft-delete; sets `revoked_at`).
- Hidden when `!canRevoke`.

A11y:

- Each row is `role="article" aria-labelledby={token}`.
- Revoke button has `aria-label` including the token suffix for screen reader clarity.

### 4. Public open route — `apps/web/src/app/[locale]/finance/budgeting/share/[token]/page.tsx` — NEW

Critical: this route is at the **locale-level path**, NOT inside `(school)`. The folder structure is:

```
apps/web/src/app/[locale]/finance/budgeting/share/[token]/page.tsx
```

Confirm the auth middleware (`apps/web/src/middleware.ts`) does NOT redirect this path. The middleware should check the path against `(school)` and `(platform)` groups; the share route sits outside both. If the middleware uses route-group-aware matching, the share route will already be excluded.

If the middleware uses a path allowlist, add `/finance/budgeting/share/` to the public allowlist explicitly.

`'use client'` page component. State machine:

```ts
type ViewState =
  | { kind: 'loading' }
  | { kind: 'password-required'; tokenPreview: string }
  | { kind: 'snapshot'; data: PublicSnapshotPayload }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'not-found' }
  | { kind: 'wrong-password' };

type PublicSnapshotPayload = {
  tenant_logo_url: string | null;
  tenant_name: string;
  model_name: string;
  fiscal_year_label: string; // "FY 2026/27"
  snapshot_version: number;
  published_at: string;
  executive_summary: string | null;
  scenarios_visible: Array<{
    key: string;
    name: string;
    is_base: boolean;
    totals_by_year: Array<{
      fiscal_year: number;
      revenue: number;
      expenditure: number;
      net_result: number;
    }>;
    line_items: Array<{
      category: string;
      subcategory: string;
      name: string;
      fiscal_year: number;
      amount: number;
    }>;
    drivers_summary: Array<{ key: string; label: string; value: string }>;
  }>;
  per_pupil_unit_economics: Array<{
    fiscal_year: number;
    revenue_per_student: number;
    expenditure_per_student: number;
    net_per_student: number;
  }>;
  currency_code: string;
};
```

Initial fetch:

```ts
const fetchPublic = async (passwordAttempt?: string) => {
  try {
    const params = new URLSearchParams();
    if (passwordAttempt) params.set('password', passwordAttempt);
    const response = await fetch(
      `${API_URL}/api/v1/budgeting/share/${token}${params.toString() ? '?' + params.toString() : ''}`,
      { credentials: 'omit' },
    );
    if (response.status === 404) {
      const body = await response.json();
      if (body.code === 'LINK_REVOKED') return setView({ kind: 'revoked' });
      if (body.code === 'LINK_EXPIRED') return setView({ kind: 'expired' });
      return setView({ kind: 'not-found' });
    }
    if (response.status === 401) {
      const body = await response.json();
      if (body.code === 'PASSWORD_REQUIRED') {
        return setView({ kind: 'password-required', tokenPreview: token.slice(-8) });
      }
      return setView({ kind: 'wrong-password' });
    }
    if (!response.ok) return setView({ kind: 'not-found' });
    const json = await response.json();
    setView({ kind: 'snapshot', data: json.data });
  } catch (err) {
    console.error('[shareable-link-public]', err);
    setView({ kind: 'not-found' });
  }
};
```

Note: this uses a raw `fetch` (NOT `apiClient`) because:

- The route is unauthenticated. We don't want bearer tokens / cookies attached.
- `credentials: 'omit'` ensures no session cookies leak.

### 5. Public view rendering

Public layout (when `view.kind === 'snapshot'`):

```
┌──────────────────────────────────────────────────────────────────────┐
│  <tenant logo>  <Tenant name>                                         │
│  Annual Financial Model — FY 2026/27 · v3 · Published 12 March 2026   │
├──────────────────────────────────────────────────────────────────────┤
│  Tabs: [ Summary ] [ Scenarios ] [ Line items ] [ Assumptions ]       │
├──────────────────────────────────────────────────────────────────────┤
│  (per-tab content; see below)                                         │
└──────────────────────────────────────────────────────────────────────┘
```

#### Summary tab (default)

- Executive summary text block (when `executive_summary` is set).
- KPI strip: total revenue / total expenditure / net result / revenue per student. Same shape as the workspace's KPI strip but read-only and centred.
- A small "Published" line at the bottom: "Published <date> · Confidential — Board of Directors".

#### Scenarios tab

- Scenario cards / chart (mirrors the phase 14 scenario compare component family).
- ONLY scenarios listed in `scenarios_visible` are rendered. If the link issuer toggled off "Growth", that scenario does not appear here.
- View toggle: Chart / Cards / Table — same primitives as the authenticated compare view, but read-only (no scenario edit affordances, no chip context menus).

#### Line items tab

- Per-category breakdown table: Income / Staff costs / Operations / Capital / Reserves & Adjustments.
- Aggregated to category + subcategory level. Per-line names, amounts, fiscal year columns.
- NO drill-down to individual driver-derived sources. NO household / student data.

#### Assumptions tab

- Drivers table: every driver with its key, label, and value (formatted).
- Read-only.
- Replaces the workspace's drivers drawer for the public view.

### 6. `_components/public-snapshot-renderer.tsx` — NEW

The component that renders the snapshot for the public route. Props:

```ts
type Props = {
  data: PublicSnapshotPayload;
};
```

Internally renders the four-tab layout. Tab state via local `useState`. Tab IDs persist in URL hash (`#summary`, `#scenarios`, `#lineItems`, `#assumptions`) so users can deep-link to a specific tab.

NO edit affordances. NO drivers drawer. NO scenario create/rename/delete affordances. NO publish / archive / share buttons.

The KPI cards, scenario chart, and line-item table are all from the existing component library (used in the authenticated workspace, phase 13/14/16) — but we wrap them in a `ReadOnlyContext` that hides any edit affordances. If the underlying components don't support a read-only mode, this phase adds it (props `readOnly` defaulted false; phase 13/14/16 components updated to respect it).

### 7. Password prompt

When `view.kind === 'password-required'`:

```
┌─────────────────────────────────────────────────────────┐
│       This link is password-protected                     │
│                                                           │
│       Token: ...<last 8 chars>                            │
│                                                           │
│       [Password input]                                    │
│       [View snapshot]                                     │
│                                                           │
│       Wrong password? Contact the person who shared       │
│       this link.                                          │
└─────────────────────────────────────────────────────────┘
```

Form: single password input, react-hook-form + zod (`min(1)`). On submit, calls `fetchPublic(password)`. On 401 with `WRONG_PASSWORD`, transitions to `view: { kind: 'wrong-password' }`. Wrong-password state shows the same form with an inline "Incorrect password — try again" error.

After 5 wrong attempts in the same session: lock the form for 60 seconds (rate limiting on the client; the server also rate-limits).

### 8. Friendly error states

Each non-success state renders a centred card:

- `expired` — "This link has expired. Contact the person who shared it for a new one."
- `revoked` — "This link has been revoked. Contact the person who shared it."
- `not-found` — "This link is no longer available."
- `wrong-password` — handled inline in the password form.

All states show the tenant brand minimally (just tenant name; no PII).

### 9. View counter (server-side)

The page increments `view_count` and updates `last_viewed_at` on the **server** as part of the `GET /v1/budgeting/share/:token` handler (defined in phase 11). The frontend doesn't issue any extra request for this — increment happens implicitly on every successful resolution.

To prevent spam-counting, the server should debounce per-token-per-IP: if the same IP hit the token within the last 60 seconds, don't increment. (This is a server-side concern — phase 11.)

### 10. PII scrubbing

The public payload from `/v1/budgeting/share/:token` (phase 11) has already had household-level, student-level, and staff-salary data stripped. The frontend NEVER renders individual rows beyond category + subcategory aggregates.

A spec-level sanity check: the `PublicSnapshotPayload` type does not have any field named `student_id`, `household_id`, `staff_id`, `salary`, `name` (other than for the tenant / model / scenario / category names). The shape is reviewed against the backend response in phase 11's tests.

### 11. Routing and middleware

Confirm the share route is NOT auth-gated:

```
apps/web/src/middleware.ts
```

Check the matcher / config. The share path needs to bypass the redirect. If currently `(school)`-based middleware redirects everything outside `(auth)` to `/login`, add a `pathname.startsWith('/<locale>/finance/budgeting/share/')` early-return.

Test by opening the URL in an incognito tab — should NOT redirect to login.

### 12. i18n

All public-page strings keyed under `budgeting.share.public.*`:

- `.title` (with interpolated `model_name`)
- `.subtitle.fiscalYear`
- `.subtitle.publishedAt`
- `.tabs.summary` / `.scenarios` / `.lineItems` / `.assumptions`
- `.errors.expired`
- `.errors.revoked`
- `.errors.notFound`
- `.errors.wrongPassword`
- `.password.title`
- `.password.tokenPreview`
- `.password.placeholder`
- `.password.submit`
- `.password.wrongAttempt`
- `.confidential`

Authenticated-page strings under `budgeting.share.manage.*`:

- `.title`
- `.subtitle`
- `.issueLink`
- `.activeLinksHeading`
- `.inactiveLinksHeading`
- `.row.expiresIn`
- `.row.viewedNTimes`
- `.row.lastViewed`
- `.row.scenarios`
- `.row.copyUrl`
- `.row.revoke`
- `.row.urlCopied`
- `.modal.title`
- `.modal.snapshotPicker`
- `.modal.expiresIn`
- `.modal.passwordOptional`
- `.modal.scenariosVisible`
- `.modal.cancel`
- `.modal.submit`
- `.modal.success.title`
- `.modal.success.url`
- `.modal.success.copyUrl`
- `.modal.success.done`
- `.modal.success.warning`
- `.revokeConfirm.title`
- `.revokeConfirm.body`
- `.revokeConfirm.confirm`

### 13. Mobile

- Authenticated link list: cards stack vertically; metadata wraps; action buttons full-width on mobile.
- Issue modal: full-screen sheet on mobile.
- Public view: tabs scroll horizontally on mobile; KPI strip 2-col grid; tables collapse to cards.
- Public view fully responsive at 375px — board members will open this on phones.

### 14. Theme

The public page should use the standard tenant tokens but constrained to the brand neutrals — no admin chrome, no nav bar, no morph shell. It's a landing page, not an app surface.

A minimal header with tenant logo + name is the only branding. The body uses `bg-background text-text-primary` per existing tokens.

## Testing requirements

- **Component tests:**
  - `issue-link-modal.spec.tsx` — form validation (min password length, scenarios required), submit calls API with correct payload, success view shows URL.
  - `link-row.spec.tsx` — copy-URL button copies correct URL, revoke button confirms and calls API, expired link disables actions.
  - `public-snapshot-renderer.spec.tsx` — renders all four tabs, hash routing works, no edit affordances visible.

- **Page-level tests:**
  - Authenticated `share/page.spec.tsx` — lists active + inactive links correctly sorted, issue modal opens, revoke flow works.
  - Public `share/[token]/page.spec.tsx` — walks the state machine: loading → password-required → wrong-password → snapshot. Asserts no auth-related redirects.

- **Playwright smoke (phase 21):**
  - As `owner@nhqs.test`, navigate to `/finance/budgeting/models/<id>/share`.
  - Click "Issue new shareable link", fill form, submit.
  - Capture the issued URL.
  - Open the URL in a new incognito context (no auth) via `browser_tabs new`.
  - Assert the public page renders the snapshot with KPI strip + scenarios + line items.
  - Assert no auth-related redirects (URL stays at `/finance/budgeting/share/...`).
  - Capture `browser_console_messages(level: 'error')`; assert empty.

  Per memory: cap at ~20 minutes; delete screenshots.

- **Privacy regression test:** parse the response from `/v1/budgeting/share/:token` (phase 11) and assert NO field named `student_id`, `household_id`, `staff_id`, `salary`, `iban`, `email`, `phone` appears anywhere in the JSON tree. Run as a unit test in this phase against a fixture response.

## Post-deploy verification

1. Rsync `apps/web/`. `pm2 restart web`.
2. Verify the middleware change works: open `https://nhqs.edupod.app/finance/budgeting/share/abc123def456` in an incognito browser. Should reach the route (will land on `not-found` since the token doesn't exist) — must NOT redirect to `/login`.
3. As `owner@nhqs.test`, open `/finance/budgeting/models/<published-model-id>/share`.
4. Click "Issue new shareable link", select 7-day expiry, no password, all scenarios visible. Submit.
5. Copy the URL. Open in an incognito browser.
6. Verify the public page renders the snapshot read-only (KPI strip, scenarios, line items, assumptions tabs).
7. Verify no household / student / staff names appear anywhere on the public page.
8. Back in the authenticated UI, revoke the link.
9. Refresh the public URL — should now show the "revoked" friendly error.
10. Resize public view to 375px — verify usability on mobile.
11. Confirm console: zero errors on either page.

## Follow-ups for subsequent waves

- Phase 20 (outputs UI + settings) reads `tenant.shareable_link_max_days` for the modal's max-expiry constraint.
- Phase 21 (polish) writes the full Playwright smoke covering issue → public → revoke, audits a11y on both surfaces, and translates Arabic strings.

## Rollback

`git revert <sha>`. Web-only restart. Phase 19 is purely a new authenticated route + a new public route + a `ReadOnlyContext` wrapper that previous workspace components opted into.

If the authenticated UI's components (phase 13/14/16) added a `readOnly` prop in this phase, those changes need to revert too. Track these via a single commit so revert is atomic.

Phase 11's backend remains intact — links can still be issued via the API directly; only the frontend surface is gone.
