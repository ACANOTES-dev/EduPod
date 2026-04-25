# Engagement Module — Master Fix & Redesign Plan

> **Status:** Plan locked. Work split into 6 implementations across 4 waves. See `IMPLEMENTATION_LOG.md` for execution order, parallelisation rules, and per-wave deployment matrix.

---

## 1. Why we're doing this

The Engagement module sits inside the Operations hub today. The Playwright audit on 2026-04-25 found that **5 of 16 pages crash or sit stuck on a skeleton loader**, **6 more render without their event-title heading**, the form-template editor saves silently into the void, and the parent-facing pages return 403 because the parent role at NHQS is missing the `parent.view_engagement` permission. On top of the broken-page list, the module's frontend uses an old hand-rolled in-page strip (`<nav className="sticky top-0 ...">` baked into `engagement/layout.tsx`) instead of the morph-shell + hub-landing-tile pattern every other module uses.

The backend is in good shape — 9 controllers, 8 services, 8 Prisma models, 8 BullMQ jobs/crons, decent unit + e2e coverage. The bugs are almost entirely on the frontend, and **most of them stem from two systemic root causes**:

1. **Response-envelope unwrap mismatch.** The API's `ResponseTransformInterceptor` wraps every singleton response in `{ data: T }`. `apiClient<T>()` does NOT auto-unwrap. There is an `unwrap()` helper at `apps/web/src/lib/api-client.ts:29` — but **zero of the 21 engagement frontend files use it**. So every singleton-fetch page reads `event.status` (gets `undefined`) instead of `event.data.status`. Paginated lists work because the wrapped paginated envelope already has `.data` and `.meta`, so the interceptor passes them through unchanged.
2. **`pageSize=500` violates the API max=100 cap.** Three pages (`conferences/setup`, `conferences/schedule`, `events/[id]/trip-pack`) request `staff-profiles?pageSize=500` and `time-slots?pageSize=500`. The pagination Zod schema rejects pageSize > 100. The API returns 400. `Promise.all` rejects, the page never leaves the skeleton.

Fix those two and ~75% of the bug burden is gone. The remaining work is the redesign you actually asked about (kill the in-page strip, build a tile dashboard at `/engagement`), the form-template editor UX, miscellaneous event sub-page polish (raw `user_id` shown as a name, parent Pay-button hard-routed to `/dashboard`, `<style jsx global>` in App Router, a few mis-mapped completion stats), and the parent-permission backfill so the parent portal works end-to-end.

This rebuild is forward-only — we are not migrating data, we are not renaming database columns, we are not breaking historic events. We're fixing the frontend, finishing the redesign, and seeding the missing permission.

---

## 2. Scope summary

| In scope                                                                                          | Out of scope                                                                           |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Auto-unwrap `{data:T}` envelope in `apiClient` (via a single targeted change in the client)       | Renaming Prisma models or migrating engagement data                                    |
| Cap `pageSize` at 100 in the three offending pages                                                | Splitting any backend service or refactoring the BullMQ topology                       |
| Replace the in-page `<nav>` strip with a tile-dashboard hub landing at `/engagement`              | Building a brand-new module or new lifecycle states                                    |
| Field-level validation visibility in the form-template editor                                     | Re-thinking the form-template field-builder UX (drag-and-drop, etc.)                   |
| Fix the `CompletionDashboard` mis-mapping for standalone form templates                           | Adding new dashboard widgets or KPI cards                                              |
| Show staff name (not raw `user_id`) on the event detail staff tab                                 | Re-architecting how staff are assigned to events                                       |
| Wire the parent Pay-button to a real finance hand-off                                             | Building a new payment flow or new Stripe integration                                  |
| Replace `<style jsx global>` in `my-schedule/page.tsx` with proper print CSS                      | Re-implementing the conference scheduler                                               |
| Fix `GET /v1/engagement/conferences/:id/my-schedule` 400                                          | Changing the conference time-slot data model                                           |
| Move the `events` page date-range filter server-side                                              | Re-implementing the events list page                                                   |
| Backfill `parent.view_engagement` + `parent.manage_engagement` on the parent role at every tenant | Auditing every other parent permission across the platform (strictly engagement-scope) |
| Translation parity sweep (engagement namespace, EN + AR)                                          | A full app-wide translation audit                                                      |
| Mobile responsiveness check at 375px on every engagement page                                     | Mobile redesign of any other module                                                    |
| Architecture-doc updates (`module-blast-radius.md`, `feature-map.md`, `danger-zones.md`)          | Re-writing the architecture handbook                                                   |

---

## 3. The two systemic fixes (Implementation 01)

### 3.1 Response envelope auto-unwrap

The cleanest fix is **inside `apiClient`** — augment the response parser so a response of shape `{ data: T }` (where `data` is the only top-level key) is automatically unwrapped to `T`, while `{ data, meta }` paginated envelopes pass through as-is. This gives every existing engagement page (and every other page in the codebase that wasn't using `unwrap()`) the correct field-level access without a 21-file change.

The exact algorithm at `apps/web/src/lib/api-client.ts`:

```ts
async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204 || response.status === 205) return undefined as T;
  if (response.headers.get('content-length') === '0') return undefined as T;
  const body = (await response.json()) as unknown;
  return autoUnwrap<T>(body);
}

function autoUnwrap<T>(body: unknown): T {
  if (
    body !== null &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    Object.keys(body as object).length === 1 &&
    'data' in (body as object)
  ) {
    return (body as { data: T }).data;
  }
  return body as T;
}
```

Single key + literal `data` + non-array body = unwrap. Anything else (paginated `{data, meta}`, error envelopes `{error: {...}}`, raw arrays) flows through.

The same `autoUnwrap` is applied to the post-401-refresh path at line 80 so the behaviour is identical on first-attempt and retry-after-refresh.

**Risk:** other modules across the codebase that _did_ call `unwrap()` defensively will get the unwrapping applied twice — but `unwrap()` is no-op when the value doesn't have a `data` key, so the double-call is safe. We grep for `unwrap()` and `unwrap<` after the change to confirm nothing breaks.

### 3.2 PageSize cap

Three files request `pageSize=500`:

- `apps/web/src/app/[locale]/(school)/engagement/events/[id]/trip-pack/page.tsx`
- `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/setup/page.tsx`
- `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/schedule/page.tsx`

Cap at `pageSize=100`. NHQS has 35 staff and a small conference will have <100 slots, so a single page is sufficient for current test tenants. For larger tenants we add a one-line follow-up TODO to paginate properly (Wave 4 / Impl 06 polish).

### 3.3 Conference `my-schedule` 400

`GET /v1/engagement/conferences/:eventId/my-schedule` returns 400 for the principal user — likely the controller assumes the caller has a `staff_profile` record (the principal in NHQS may be a `school_owner` only). The fix is in the controller / service: gracefully return an empty schedule (`{ slots: [], bookings: [] }` with 200) when the caller has no staff profile, instead of throwing 400. Frontend handles the empty state already.

---

## 4. The redesign (Implementation 02)

### 4.1 Today

- `/engagement/page.tsx` is a bare server-component redirect → `/engagement/events`.
- `/engagement/layout.tsx` is a `'use client'` component that renders `<nav className="sticky top-0 z-10 ...">` with 4 links (Form Templates, Events, Analytics, Consent Archive). The strip is part of the page body, not the morph-shell sub-strip.
- `nav-config.ts → hubSubStripConfigs` has **no entry for engagement** (or for `operations`). The morph shell renders no sub-strip when the user is on `/engagement/*`.
- Result: the in-page strip and the morph bar are decoupled, and the strip's `sticky top-0` fights for vertical space with the morph bar.

### 4.2 Target

- **`/engagement/page.tsx` becomes a real hub landing page** with 4 tiles matching the Operations hub pattern (`/operations`):
  - **Events** — "Plan trips, conferences, and activities. Track participation."
  - **Form Templates** — "Build bilingual consent forms, surveys, and risk assessments."
  - **Analytics** — "Track completion rates, response times, and outstanding items."
  - **Consent Archive** — "Search and audit consent history by student or form."
- Each tile is a button (matches `apps/web/src/app/[locale]/(school)/operations/page.tsx` pattern) with an icon, label, description, and click-through to the relevant sub-route.
- Tiles are permission-aware: a user without `engagement.consent_archive.view` doesn't see the Consent Archive tile.

- **`/engagement/layout.tsx` deletes the inline `<nav>` strip entirely.** Sub-routes render under the morph shell with no in-page navigation. Users navigate between sub-routes via:
  - Clicking the engagement tile on the operations hub then a tile on the engagement hub.
  - Browser back-button.
  - Cross-links inside the page (e.g. event detail → event participants).
  - Breadcrumbs (already provided by the morph shell on a per-page basis where defined).

- **`nav-config.ts → hubSubStripConfigs` adds an explicit `engagement: []` entry** to declare "no sub-strip for engagement, the hub landing IS the navigation surface". This matches how `finance: []`, `people: []`, `wellbeing: []` already behave.

- **The Operations hub tile for Engagement (`/operations` page) is unchanged.** It already routes to `/engagement` correctly; with the new hub landing, the user sees tiles instead of being immediately dumped into the events list.

### 4.3 Mobile

The hub landing is single-column on mobile (`<375px`), 2-column at `md:`, 3-column at `lg:` — matches the Operations hub responsive pattern.

### 4.4 No backend changes

This entire implementation is frontend-only. Three files touched (`page.tsx`, `layout.tsx`, `nav-config.ts`) plus translation key additions for the four tile titles + descriptions.

---

## 5. Form template editor (Implementation 03)

### 5.1 Today

- `_components/form-template-editor.tsx` uses `react-hook-form` + `zodResolver(createEngagementFormTemplateSchema)`.
- When validation fails (e.g. `consent_type` is required for `consent_form` type but the field has no default), `handleSubmit` silently blocks. **No field-level errors are rendered. No toast. No console warning.** The user clicks Save, nothing happens.
- After a successful save, `router.push(\`/${locale}/engagement/form-templates/${savedTemplate.id}\`)`— but`savedTemplate`is the wrapped`{ data: {...} }`envelope, so`savedTemplate.id`is`undefined`and the user lands on`/form-templates/undefined`. (The Impl 01 envelope fix resolves this for free; this impl just verifies it post-fix.)
- The published-template detail page (`form-templates/[id]/page.tsx:188–196`) feeds `CompletionDashboard` with `paymentPaid={stats.total - stats.pending}` (this is "not pending", not "paid") and `registered={stats.submitted}` (reusing submitted as both consent and registration). For a standalone consent form not linked to a fee-bearing event, two of the three completion cards display incorrect percentages.

### 5.2 Target

- **Field-level validation errors render under each field.** For every `Input`/`Select`/`Textarea` in the editor, a `FormMessage` from `@school/ui` shows the `formState.errors.<field>?.message` if present. The form-state already has the data; we just need to surface it.
- **A toast on submission failure.** When `form.handleSubmit` fails validation, we now render `toast.error(t('builder.validationError'))` instead of doing nothing. The user always knows their click was acknowledged.
- **CompletionDashboard semantics fixed.** When the form template is NOT linked to a fee-bearing event, render only the consent card (single card, full-width) instead of three mis-mapped cards. When the template IS linked to an event, render all three cards with the correct stats fed from the event's dashboard endpoint (not the form-template stats endpoint).
- **Field-key auto-generation tightened.** Today the auto-generated `field_key` looks like `engagement_field_1_38cn5x` — a non-trivial format that often gets manually edited and trips the regex. Update the auto-generator to produce `field_<incrementing_index>` (e.g. `field_1`, `field_2`) when the field is fresh and the user hasn't customized the key.
- **End-to-end verification on production:** create a draft → save → publish → distribute → fill as parent → submit → verify it lands in submissions list and consent archive.

---

## 6. Event sub-pages + parent flow polish (Implementation 04)

### 6.1 Today

- **Event detail staff tab** (`events/[id]/page.tsx:372`): subtitle is `{assignment.staff.user_id ?? '—'}` — a raw UUID. Should be the staff member's name + role.
- **Parent Pay-button** (`parent/events/page.tsx:374`, `parent/events/[id]/page.tsx:185`): hard-routes to `/${locale}/dashboard`. There's no actual payment hand-off — clicking does nothing useful.
- **Trip-pack PDF download** (`events/[id]/trip-pack/page.tsx:90`): uses raw `fetch()` instead of `apiClient`. Per MEMORY note `project_frontend_bearer_for_blob_downloads`, raw `fetch` needs an explicit `Authorization` header — verify this is being attached, fix if not.
- **Conference my-schedule** (`conferences/[id]/my-schedule/page.tsx:96`): uses `<style jsx global>` for print CSS — Pages-Router-only pattern that silently no-ops in App Router. Print rules never apply.
- **Events list date filter** (`events/page.tsx:80–94`): `dateFrom`/`dateTo` filters apply _client-side_ after fetching one page of 20 events. With more events, off-page matches are silently dropped. Move the date filter server-side via new `start_date_from` / `start_date_to` query params on the existing `GET /v1/engagement/events` endpoint.
- **Lifecycle actions verification:** publish, open, close, cancel, complete, plus the risk-assessment approve/reject path. The audit didn't run these end-to-end — this impl does and fixes anything that breaks.

### 6.2 Target

- Staff tab subtitle becomes `<staff name> — <role label>` (e.g. "Sarah Daly — Trip Leader"). Pulls `staff.first_name`, `staff.last_name`, and the localised role label from the existing staff lookup map.
- Parent Pay-button routes to `/${locale}/dashboard?tab=Finances` (existing parent finance tab) with the invoice ID in the query string, so the parent dashboard's Finance tab can highlight the relevant invoice. (Invoice is created when the event is published — the linkage already exists via `EngagementEventParticipant.invoice_id`.) If no invoice is linked yet (event not published), button is disabled with a tooltip "Payment not yet open".
- Trip-pack download switched to `apiClient` with a new `responseType: 'blob'` option, so the Bearer header is attached automatically.
- `<style jsx global>` removed; print CSS moved into a regular CSS module or a `print:` Tailwind variant in the relevant section.
- New backend query params `start_date_from` and `start_date_to` on `EventsService.list`. Frontend passes them. Date filter no longer drops off-page events.
- All lifecycle actions verified on production with the existing School Trip event: publish → open → mark attendance → close → complete. Risk assessment: approve + reject. Any breakage fixed.

---

## 7. Permission backfill (Implementation 05)

### 7.1 Today

Login as `parent@nhqs.test`. Toast on dashboard:

- "Missing required permission: parent.view_engagement" (×2)
- "Missing required permission: parent.manage_engagement" (likely also missing — not surfaced because no parent action triggered it)

Both `parent.view_engagement` and `parent.manage_engagement` permissions are defined in the engagement controllers but **NOT seeded onto the `parent` role at NHQS**. This is the same pattern as the SEND module backfill (MEMORY note `project_sen_response_shape_pattern.md`).

### 7.2 Target

- Audit the `role_permissions` table for the `parent` role at every tenant. Identify which tenants are missing `parent.view_engagement` and/or `parent.manage_engagement`.
- Write a one-shot idempotent backfill script at `packages/prisma/scripts/backfill-parent-engagement-permissions.ts` that adds these permissions to the parent role per tenant, skipping any tenant where they're already present.
- Run the script against production via SSH (the script is idempotent and safe to re-run).
- Update the **role-permission seed file** that defines what new tenants get on creation, so future tenants don't need this fix.
- Verify on production: log in as `parent@nhqs.test`, confirm "Missing required permission" toasts are gone, parent events page loads without 403, parent can register a child for an open event.

### 7.3 Scope discipline

This impl is **engagement-only**. The audit also surfaced missing `parent.homework`, `parent.view_finances`, and `homework.view_diary` — those are NOT in scope for engagement-fix. They get a single-line follow-up note in the completion record so they're visible, but they don't block this rebuild.

---

## 8. Regression sweep + i18n + mobile (Implementation 06)

### 8.1 Translation parity

- Audit `messages/en.json` and `messages/ar.json` for the `engagement` namespace.
- Specifically: every event status (`draft`, `published`, `open`, `closed`, `in_progress`, `completed`, `cancelled`, `archived`) must have a key under `engagement.statuses.*` in both files. The audit surfaced `MISSING_MESSAGE: engagement.statuses.undefined` — that's the envelope bug, but verify there's no genuinely-missing status key.
- New keys added by Impls 02-05 must be present in both files in the right structure.

### 8.2 Full Playwright revisit

Re-run the audit walkthrough on every engagement route post-fix. Checklist:

- `/operations` → tile dashboard renders, Engagement tile clickable.
- `/engagement` → new tile dashboard renders (Impl 02).
- `/engagement/events` → list renders with the existing School Trip event.
- `/engagement/events/new` → wizard renders + creates a real event end-to-end.
- `/engagement/events/[id]` → detail renders cleanly (no error boundary, status badge correct, dashboard cards correct).
- `/engagement/events/[id]/{participants,attendance,risk-assessment,incidents,trip-pack}` → all render with event title in the page header.
- `/engagement/form-templates` → list renders.
- `/engagement/form-templates/new` → editor renders, save-as-draft saves and navigates to the detail page (proves Impl 01 + 03).
- `/engagement/form-templates/[id]` → detail renders with correct CompletionDashboard for the template type.
- `/engagement/analytics` → renders with KPI cards + charts (no error boundary).
- `/engagement/consent-archive` → list renders.
- `/engagement/conferences/[id]/{setup,schedule,my-schedule}` → all render (no skeleton lock).
- `/engagement/parent/events` (as parent) → renders without 403, shows the parent's events.
- `/engagement/parent/events/[id]` (as parent) → detail renders, register/withdraw/pay buttons functional.

### 8.3 Mobile responsiveness

Every page checked at 375px width in Playwright. Particularly the hub landing (Impl 02) and the event detail page (lots of cards). Failure mode is horizontal overflow.

### 8.4 Architecture docs

- `docs/architecture/module-blast-radius.md` — verify the engagement module's exports/consumers list still matches reality.
- `docs/architecture/feature-map.md` — confirm every page listed exists and the route paths match. Update the "Engagement" section if anything changed (likely no change to the route list, but the hub landing is new).
- `docs/architecture/danger-zones.md` — add an entry for "engagement frontend uses `apiClient` directly without `unwrap()`" → cross-reference the Impl 01 fix that eliminated the need.

---

## 9. Wave breakdown

| Wave  | Impls  | Theme                                                                          | Parallelisation |
| ----- | ------ | ------------------------------------------------------------------------------ | --------------- |
| **1** | 01     | Foundation: envelope unwrap + pagination cap + my-schedule 400                 | serial          |
| **2** | 02, 03 | Hub landing + Form templates editor (both touch translations → parallel-risky) | parallel-risky  |
| **3** | 04, 05 | Event sub-pages + parent flow + permission backfill                            | parallel-safe   |
| **4** | 06     | Regression sweep, i18n, mobile, docs                                           | serial          |

Full wave rules, parallelisation modes, and per-impl deployment matrix live in `IMPLEMENTATION_LOG.md`.

---

## 10. Component map

```
apps/web/src/
├── app/[locale]/(school)/engagement/
│   ├── page.tsx                                (REWRITTEN — was redirect, now tile dashboard)         [02]
│   ├── layout.tsx                              (REWRITTEN — strip the inline <nav>)                   [02]
│   ├── _components/
│   │   ├── form-template-editor.tsx            (MODIFIED — field errors + validation toast + key gen)  [03]
│   │   ├── completion-dashboard.tsx            (MODIFIED — variant for standalone form templates)      [03]
│   │   └── (no other component changes)
│   ├── events/
│   │   ├── page.tsx                            (MODIFIED — server-side date filter)                    [04]
│   │   ├── [id]/
│   │   │   ├── page.tsx                        (MODIFIED — staff tab name display)                     [04]
│   │   │   └── trip-pack/page.tsx              (MODIFIED — pageSize cap + Bearer-attached download)    [01, 04]
│   ├── conferences/[id]/
│   │   ├── setup/page.tsx                      (MODIFIED — pageSize cap)                               [01]
│   │   ├── schedule/page.tsx                   (MODIFIED — pageSize cap)                               [01]
│   │   └── my-schedule/page.tsx                (MODIFIED — kill <style jsx global>, real print CSS)    [04]
│   ├── form-templates/[id]/page.tsx            (MODIFIED — CompletionDashboard variant)                [03]
│   └── parent/events/
│       ├── page.tsx                            (MODIFIED — Pay button finance hand-off)                [04]
│       └── [id]/page.tsx                       (MODIFIED — Pay button finance hand-off)                [04]
│
└── lib/
    ├── api-client.ts                           (MODIFIED — autoUnwrap singleton {data:T} envelopes)    [01]
    └── nav-config.ts                           (MODIFIED — explicit engagement: [] in hubSubStripConfigs) [02]

apps/api/src/modules/engagement/
├── conferences.controller.ts                   (MODIFIED — my-schedule returns empty when no profile)  [01]
├── conferences.service.ts                      (MODIFIED — my-schedule guard)                          [01]
└── events.service.ts                           (MODIFIED — list() accepts start_date_from / _to)       [04]

packages/shared/src/engagement/
└── event.schema.ts                             (MODIFIED — listEventsQuerySchema + start_date_from/_to) [04]

packages/prisma/scripts/
└── backfill-parent-engagement-permissions.ts   (NEW — idempotent permission backfill per tenant)       [05]

packages/prisma/seed/
└── (the role-permission seed file, exact path TBD by impl 05) (MODIFIED — parent role gets engagement perms by default) [05]

messages/
├── en.json                                     (MODIFIED — new tile keys, validation keys, etc.)       [02, 03, 04, 06]
└── ar.json                                     (MODIFIED — Arabic translations for all new keys)       [02, 03, 04, 06]

docs/architecture/
├── module-blast-radius.md                      (VERIFIED — no changes expected, but checked)           [06]
├── feature-map.md                              (MODIFIED — confirm engagement routes accurate)         [06]
└── danger-zones.md                             (MODIFIED — add envelope-unwrap historic note)          [06]
```

---

## 11. Out of scope

- **Backfilling consent / engagement data.** Existing test events stay as-is. We are not migrating data.
- **Renaming Prisma models or columns.** The `EngagementConsentRecord` vs GDPR `ConsentRecord` naming collision stays for now — too risky to rename, and they don't actually conflict at the code level.
- **Building a brand-new sub-module.** No new entities, no new state machines, no new BullMQ queues.
- **Re-architecting the form builder UX.** Drag-and-drop field reordering, conditional-visibility GUI improvements, multi-language preview side-by-side — all future work.
- **Stripe integration changes.** The parent Pay button hand-off uses the existing finance/invoices flow. No new Stripe SKUs, no new checkout sessions.
- **Backfilling other parent permissions** (`parent.homework`, `parent.view_finances`, `homework.view_diary`). Those are real gaps but they belong to the homework / finance fixes, not engagement-fix.
- **Cross-module engagement consumers.** `EarlyWarningModule` consumes `EngagementEventsService` — we are not changing that contract.
- **Conferences booking flow rebuild.** The parent booking pages (`/parent/conferences/[id]/book`, `/parent/conferences/[id]/my-bookings`) are not in the broken-page list. They get a smoke test in Impl 06 but no rewrite.

---

## 12. Why this shape

**Why fix `apiClient` once instead of changing 21 files?** The 21-file change is the same single bug repeated. Fixing it in one place (`apiClient.ts`) means the fix automatically benefits any other module in the codebase that also uses the raw response. The `autoUnwrap` algorithm is conservative — single-key + literal `data` + non-array body — so it won't accidentally strip data from paginated responses, error envelopes, or genuine arrays. Existing code that uses `unwrap()` is not broken by the change because `unwrap()` is idempotent on already-unwrapped values.

**Why kill the in-page strip rather than wire it into the morph-shell sub-strip?** Every other tile-dashboard hub (Finance, People, Wellbeing, Communications) declares `<hub_key>: []` in `hubSubStripConfigs`, signalling "the hub landing IS the navigation surface; no sub-strip needed". Engagement should match. Wiring engagement into the sub-strip would create yet another navigation pattern in an app that already has too many.

**Why a dedicated permission-backfill implementation instead of folding it into Impl 06?** The backfill is a one-shot DB operation against production with potential blast radius (it touches RBAC). It deserves its own commit, its own deployment, its own verification step, and its own completion record so it's auditable later. It also unblocks parent-side testing for Impl 06's regression sweep — running it earlier in the sequence is a deliberate choice.

**Why is Wave 2 parallel-risky?** Both Impl 02 and Impl 03 add translation keys to `messages/en.json` and `messages/ar.json`. Translation files are the single hottest shared file in the rebuild — race conditions there cost the new-inbox rebuild ~90 minutes. Hardened rules H8/H9 (translation buffer + deep-merge) apply.

**Why Wave 3 parallel-safe?** Impl 04 (frontend event sub-pages + backend `events.service` query param) and Impl 05 (Prisma seed script + script execution) touch entirely different file zones. No shared files. Translations for Impl 04 buffer to Wave 4 / Impl 06 (the i18n sweep), so no en.json/ar.json conflict. Safe to parallelise.

**Why no `engagement.statuses.*` translation key fix in Impl 06?** It IS in Impl 06, in the i18n parity sweep — but the underlying root cause (status comes through as `undefined`) is fixed by Impl 01's envelope unwrap. The `MISSING_MESSAGE: engagement.statuses.undefined` console error goes away the moment Impl 01 ships. Impl 06 just verifies the parity for completeness.

**Why "verify on production" in every impl rather than relying on local tests?** The audit found multiple bugs that local tests passed but production exposed (envelope unwrap, pageSize cap, missing parent permission). Local tests use mocked Prisma + mocked HTTP, so the real `ResponseTransformInterceptor` and the real RBAC middleware are bypassed. Production verification is the only way to know the fix actually works for users.
