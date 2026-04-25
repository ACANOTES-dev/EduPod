# Implementation 04 — Event sub-pages + parent flow polish

> **Wave:** 3 (parallel-safe with Impl 05 — different file zones)
> **Classification:** full-stack (frontend + minor backend + shared schema)
> **Depends on:** 01, 02, 03
> **Deploys:** API restart + Web restart + `@school/shared` rebuild

---

## Goal

Clean up the long tail of small event-detail / parent-flow / conferences bugs the audit surfaced. None of them individually crash a page, but together they make the module feel half-finished. Specifically:

1. **Staff tab on event detail** displays raw UUIDs as subtitles instead of names + roles.
2. **Parent Pay button** hard-routes to `/${locale}/dashboard` (placeholder). Wire a real finance hand-off.
3. **`<style jsx global>` print CSS** in `my-schedule/page.tsx` silently no-ops in App Router. Replace with proper print CSS.
4. **Events list date filter** runs client-side after one page of 20 results — drops off-page matches. Move server-side via new query params.
5. **Trip-pack PDF download** uses raw `fetch()` — verify the Bearer token is attached or switch to `apiClient`.
6. **Lifecycle action verification** — publish/open/close/cancel/complete plus risk-assessment approve/reject paths haven't been smoke-tested end-to-end.

After this impl ships:

- Event detail staff tab shows "Sarah Daly — Trip Leader" instead of a UUID.
- Parent clicking "Pay" lands on the parent dashboard's Finance tab with the relevant invoice surfaced.
- Conference my-schedule page prints with proper print styles applied.
- Events list date range filter works across all events, not just the first page.
- Trip-pack PDF download works for any authenticated user with the trip-pack permission.
- All event lifecycle transitions verified working on production.

## Shared files this impl touches

- `apps/web/src/app/[locale]/(school)/engagement/events/[id]/page.tsx` — staff tab name display.
- `apps/web/src/app/[locale]/(school)/engagement/events/[id]/trip-pack/page.tsx` — Bearer-attached download.
- `apps/web/src/app/[locale]/(school)/engagement/events/page.tsx` — date filter passes server-side params.
- `apps/web/src/app/[locale]/(school)/engagement/parent/events/page.tsx` — Pay button finance hand-off.
- `apps/web/src/app/[locale]/(school)/engagement/parent/events/[id]/page.tsx` — Pay button finance hand-off.
- `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/my-schedule/page.tsx` — kill `<style jsx global>`, real print CSS.
- `apps/api/src/modules/engagement/events.service.ts` — `list()` accepts `start_date_from` / `start_date_to`.
- `apps/api/src/modules/engagement/events.service.spec.ts` — test the new query params.
- `packages/shared/src/engagement/event.schema.ts` (or wherever the events query schema lives) — extend `listEventsQuerySchema` with the new params.
- `messages/en.json` / `messages/ar.json` — small additions for new tooltip / button labels.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Always in a separate commit.

## What to build

### Sub-step 1: Staff tab name display (event detail)

Open `apps/web/src/app/[locale]/(school)/engagement/events/[id]/page.tsx`. Find the staff-tab render (around line 360–385). Today:

```tsx
<p className="text-xs text-text-tertiary">{assignment.staff.user_id ?? '—'}</p>
```

The `staffLookup` map (built earlier in the file, around line 97–105) already maps staff IDs to names. Use it for the subtitle too — but include the role label.

Replace with:

```tsx
<p className="text-xs text-text-tertiary">{humanizeStatus(assignment.role)}</p>
```

The current title line `<p className="font-medium text-text-primary">{staffLookup.get(assignment.staff.id) ?? assignment.staff.id}</p>` already shows the name. The subtitle should be the role (e.g. "Organiser", "Supervisor", "Trip Leader"), not a duplicate UUID.

If you also want to surface the email, fetch it via the existing `staffOptions` data (already loaded into state — extend the lookup map to carry `email` alongside `name`).

### Sub-step 2: Parent Pay button — finance hand-off

Open `apps/web/src/app/[locale]/(school)/engagement/parent/events/page.tsx` and `parent/events/[id]/page.tsx`. Both have a Pay button that hard-routes to `/${locale}/dashboard`.

The participant data already includes `invoice_id` (from `EngagementEventParticipant.invoice_id` — populated when the event is published and an invoice is generated for the fee-bearing participant). Use it.

Replace the `onClick` handler:

```tsx
onClick={() => {
  if (!participant.invoice_id) return; // Button should be disabled in this case
  router.push(`/${locale}/dashboard?tab=finances&invoice=${participant.invoice_id}`);
}}
disabled={!participant.invoice_id}
title={!participant.invoice_id ? t('parent.events.payNotOpen') : undefined}
```

The parent dashboard's Finance tab (`apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx` or similar) already handles the `?tab=finances` query param. The `?invoice=<id>` query param is new — add minimal handling on the parent dashboard to scroll/highlight the relevant invoice row. If the parent dashboard doesn't already have a hash-targeted invoice row, the simple `?tab=finances` redirect alone is acceptable for this impl (note as follow-up).

If `participant.invoice_id` is not in the parent endpoint response, extend `apps/api/src/modules/engagement/parent-events.controller.ts` `select` clause to include it. The field already exists in the database; just expose it in the API.

### Sub-step 3: Replace `<style jsx global>` in `my-schedule`

Open `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/my-schedule/page.tsx`. Around line 96 (or wherever the styled-jsx block lives):

```tsx
<style jsx global>{`
  @media print {
    .no-print {
      display: none;
    }
    /* ... */
  }
`}</style>
```

This pattern is silently dropped by App Router. Replace with Tailwind's `print:` variants applied directly to the relevant elements:

- For "hide on print" — add `print:hidden` to the elements (instead of `.no-print`).
- For "white background" — add `print:bg-white print:text-black` to the page wrapper.
- For "no shadow" — add `print:shadow-none` to cards.
- For page break behaviour — Tailwind has `print:break-before-page`, `print:break-after-page`.

Walk through every `className="no-print"` (or whatever the styled-jsx selectors target) and translate to the equivalent `print:` Tailwind utility.

If the original print CSS is more complex (specific font sizes, custom margins), and `print:` utilities don't cover it, add a small CSS module file `my-schedule.module.css` co-located with the page and import it. CSS modules ARE supported by App Router — `<style jsx global>` is not.

### Sub-step 4: Server-side date filter on events list

**Frontend** — open `apps/web/src/app/[locale]/(school)/engagement/events/page.tsx`. Find the client-side date filter (around line 80–94):

```tsx
const filteredEvents = React.useMemo(() => {
  return events.filter((event) => {
    const startDate = event.start_date ? new Date(event.start_date) : null;
    if (dateFrom && startDate && startDate < new Date(dateFrom)) return false;
    if (dateTo && startDate && startDate > new Date(dateTo)) return false;
    return true;
  });
}, [dateFrom, dateTo, events]);
```

Delete this block. Move the date params into the `fetchEvents` request:

```tsx
if (dateFrom) params.set('start_date_from', dateFrom);
if (dateTo) params.set('start_date_to', dateTo);
```

Update the dependency array of `fetchEvents` to include `dateFrom` and `dateTo`. Use `events` directly in the render (not `filteredEvents`).

Remove the `setPage(1)` effect that reset the page when date filters changed, OR keep it (it's still correct behaviour — changing filters resets pagination).

**Shared schema** — open `packages/shared/src/engagement/event.schema.ts` (or wherever `listEventsQuerySchema` lives). Find the existing query schema and add:

```ts
start_date_from: z.string().date().optional(),
start_date_to: z.string().date().optional(),
```

**Backend** — open `apps/api/src/modules/engagement/events.service.ts`. Find the `list()` method. The existing where clause likely has filters for `status`, `event_type`, `search`, `academic_year_id`. Add date filtering:

```ts
if (query.start_date_from) {
  where.start_date = { ...(where.start_date ?? {}), gte: new Date(query.start_date_from) };
}
if (query.start_date_to) {
  where.start_date = { ...(where.start_date ?? {}), lte: new Date(query.start_date_to) };
}
```

If the controller doesn't validate query params via `ZodValidationPipe`, add it. The shared `listEventsQuerySchema` should drive a `ZodValidationPipe` on the query parameter at the controller level.

Add tests in `events.service.spec.ts`:

- list with `start_date_from` only — filters out events before the date.
- list with `start_date_to` only — filters out events after the date.
- list with both — bracket filter.

### Sub-step 5: Trip-pack download Bearer audit

Open `apps/web/src/app/[locale]/(school)/engagement/events/[id]/trip-pack/page.tsx`. Find the `downloadPdf` function (around line 75–95). It uses raw `fetch()`:

```tsx
const response = await fetch(downloadUrl, {
  credentials: 'include',
});
```

Per MEMORY note `project_frontend_bearer_for_blob_downloads`, raw `fetch` does NOT inherit the Bearer token from `apiClient` state. Fix by importing `getAccessToken` and attaching:

```tsx
import { getAccessToken } from '@/lib/api-client';

// ...

const token = getAccessToken();
const response = await fetch(downloadUrl, {
  credentials: 'include',
  headers: token ? { Authorization: `Bearer ${token}` } : undefined,
});
if (!response.ok) {
  throw new Error(`Trip pack download failed with status ${response.status}`);
}
const blob = await response.blob();
// ... existing blob-to-download code
```

Or if `apiClient` supports binary responses directly, use it. Verify the api-client's `parseResponse` doesn't choke on a binary body (it currently calls `.json()` which would fail for a PDF) — if not, the explicit `fetch` + Bearer is the right pattern.

### Sub-step 6: Lifecycle action verification

This is a manual verification step, not a code change. After the above fixes deploy, exercise every event lifecycle transition on production using the existing School Trip event:

1. Draft → Publish (existing event is in Draft)
2. Published → Open (manually if event isn't ready to open)
3. Open → Close
4. Close → Complete (or directly Complete)
5. Cancel from any non-terminal state

For each transition, verify:

- The Action button shows up in the right state.
- Clicking it calls the correct API endpoint and returns 200.
- The page reloads and reflects the new state.
- The status badge updates in the page header.

For the risk-assessment path:

1. Create a risk-assessment form template (Impl 03 work makes this possible).
2. Link it to the event via the event editor (or directly if the wizard supports it).
3. Approve / reject the risk assessment from `/engagement/events/[id]/risk-assessment`.
4. Verify the event's `risk_assessment_status` reflects the transition.

If any transition is broken (button missing, API 500, state machine rejection), fix it as part of this impl. Each fix is a small commit.

### Sub-step 7: Translation keys

Add to `messages/en.json`:

```json
{
  "engagement": {
    "parent": {
      "events": {
        "payNotOpen": "Payment is not open yet for this event."
      }
    }
  }
}
```

And `messages/ar.json`:

```json
{
  "engagement": {
    "parent": {
      "events": {
        "payNotOpen": "الدفع غير مفتوح بعد لهذه الفعالية."
      }
    }
  }
}
```

By Wave 3, Impls 02 and 03 have already shipped their translation additions to `messages/*.json`. Re-read the file before merging to avoid clobbering. Use Rule H9 (deep-merge).

### Sub-step 8: Local regression sweep

Run:

```bash
pnpm turbo run type-check --filter=@school/web --filter=@school/api --filter=@school/shared
pnpm turbo run lint --filter=@school/web --filter=@school/api --filter=@school/shared
pnpm turbo run test --filter=@school/web --filter=@school/api --filter=@school/shared
```

The `events.service` change adds new query params — existing tests should still pass (the params are optional). Add the new tests per sub-step 4.

## Tests

- `events.service.spec.ts` — new tests for `start_date_from` / `start_date_to` filtering (3 cases).
- Optional: snapshot test for `CompletionDashboard` standalone variant (deferred to Impl 03 if it adds one; this impl doesn't need it).
- Regression: all package tests pass with zero new failures.

## Watch out for

- **The `humanizeStatus` helper exists** in `_components/engagement-types.ts` — use it for the role label instead of hand-formatting `assignment.role`.
- **Parent dashboard query param handling.** If the parent dashboard doesn't already inspect `?tab=finances` and switch tabs accordingly, the redirect lands on the default tab. That's still better than the current behaviour (lands on `/dashboard` with no signal). Note as a follow-up.
- **`participant.invoice_id` may be null** even after publish, if the participant doesn't owe a fee (free event, fee waived). The button must be disabled in that case — don't show "Pay" with a broken click handler.
- **`<style jsx global>` may have other consequences.** If the page imports `styled-jsx` types or has any other styled-jsx blocks, those need cleanup too. Search the file for `style jsx`.
- **The shared package rebuild is non-trivial.** `packages/shared` uses `tsc --incremental`. After your schema change, the deploy flow MUST run `rm -rf packages/shared/dist packages/shared/tsconfig.tsbuildinfo` before `pnpm --filter @school/shared run build`. See `reference_deploy_quirks` MEMORY note. Skipping this step ships a stale `dist/` and the API crash-loops.
- **The trip-pack download might 403 for parents** even after the Bearer fix — the route is gated by `engagement.trip_pack.download` permission, which parents don't have. That's correct behaviour — verify parents don't see the trip-pack link in the parent UI (they shouldn't; it's a staff-only feature).
- **Sibling Impl 05 does NOT touch any of these files.** Impl 05 is a Prisma seed script and a one-shot DB backfill. No `apps/web` or `apps/api` overlap. Wave 3 is parallel-safe.

## Deployment notes

API restart + Web restart + shared package rebuild (full `dist` + `tsbuildinfo` clean for `@school/shared`).

1. Commit locally (split: staff display / Pay button / print CSS / date filter / trip-pack download / lifecycle fixes / translations).
2. Rsync the affected files (or full repo with the standard excludes from CLAUDE.md):
   ```bash
   rsync -avz --delete \
     --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='dist' \
     --exclude='.env' --exclude='.env.local' --exclude='.turbo' --exclude='*.tsbuildinfo' \
     /Users/ram/Desktop/SDB/ root@46.62.244.139:/opt/edupod/app/
   ```
3. `ssh root@46.62.244.139 'chown -R edupod:edupod /opt/edupod/app/'`
4. **Shared package — clean rebuild (mandatory):**
   ```bash
   ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && rm -rf packages/shared/dist packages/shared/tsconfig.tsbuildinfo && pnpm --filter @school/shared run build"'
   ```
5. **API + Web — force rebuild and restart:**
   ```bash
   ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && rm -rf apps/web/.next && pnpm turbo run build --filter=@school/api --filter=@school/web --force"'
   ssh root@46.62.244.139 'sudo -u edupod PM2_HOME=/home/edupod/.pm2 pm2 restart api web --update-env'
   ```
6. **Smoke test (mandatory):**
   - Event detail staff tab → name + role label, no UUID.
   - `/engagement/events?dateFrom=2026-01-01&dateTo=2026-12-31` → URL query param drives a backend filter (visible in network tab).
   - Parent Pay button → if invoice_id present, disabled state with tooltip when not. With invoice present: navigates to `/dashboard?tab=finances&invoice=...`.
   - `/engagement/conferences/<id>/my-schedule` → print preview (Cmd+P) shows the schedule WITHOUT the page chrome and with white background.
   - Trip-pack download → file downloads as PDF, opens correctly.
   - Each lifecycle transition (publish, open, close, complete, cancel) → 200 from API, page reflects new state.
7. **Pre-deploy serialisation check (Rule 6b):** if Impl 05 is in `deploying`... actually Impl 05 has no shared deployment target, so no serialisation needed. Wave 3 is parallel-safe.
8. Log flips to `completed` in a separate commit after verification.
