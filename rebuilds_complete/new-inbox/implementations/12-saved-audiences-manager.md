# Implementation 12 — Saved Audiences Manager UI

> **Wave:** 4 (parallel with 10, 11, 13, 14, 15)
> **Depends on:** 01, 03
> **Deploys:** Web restart only

---

## Goal

A dedicated **saved audiences** management surface where school staff can browse, create, edit, preview, and delete the tenant's saved audiences (both static and dynamic). The compose dialog (impl 11) consumes saved audiences via a dropdown — this implementation is where they're created and curated.

## What to build

### 1. The list page

`apps/web/src/app/[locale]/(school)/inbox/audiences/page.tsx`

A full-page list of all saved audiences in the tenant. Calls `GET /v1/inbox/audiences`.

Columns:

- Name
- Description (truncated)
- Kind (`static` / `dynamic` badge)
- Created by + created at
- Last resolved count (from a small lazy fetch — see below)
- Actions: view, edit, duplicate, delete

The "last resolved count" is fetched lazily per row via `POST /v1/inbox/audiences/preview` (using the saved audience's definition). For static audiences, the count is just `definition_json.user_ids.length` — no API call needed.

Header bar: title + "+ New Audience" button + search input (filter by name).

Filter chips: `All` / `Static` / `Dynamic`.

Empty state: "No saved audiences yet. Create one to reuse it across announcements and messages."

### 2. The new audience page

`apps/web/src/app/[locale]/(school)/inbox/audiences/new/page.tsx`

A form to create a new saved audience. Two modes:

- **Static** — opens a people picker (multi mode from impl 11) to handpick users. Save creates `kind: static, definition_json: { user_ids: [...] }`.
- **Dynamic** — opens the audience chip builder (from impl 11) to compose providers. Save creates `kind: dynamic, definition_json: { ... composed tree ... }`.

Fields:

- Name (required, unique per tenant — surface the `SAVED_AUDIENCE_NAME_TAKEN` error inline)
- Description (optional, 1024 chars)
- Kind toggle (radio: Static / Dynamic)
- Builder (changes based on kind toggle)
- Live preview count + sample names (for dynamic, refresh on definition change)
- Save button

Reuses `audience-chip-builder.tsx` and `people-picker.tsx` from impl 11 — no duplication. Both components are imported as building blocks.

### 3. The detail / edit page

`apps/web/src/app/[locale]/(school)/inbox/audiences/[id]/page.tsx`

View an existing saved audience. Same fields as the new page, populated. The kind toggle is **disabled** (you can't convert static → dynamic or vice versa; users must duplicate-and-rebuild).

For dynamic audiences, includes a "Resolve now" button that calls `GET /v1/inbox/audiences/:id/resolve` and shows the full resolved member list (paginated, 50 per page). This is for safeguarding — admins want to verify "Parents in arrears > €500" actually resolves to the parents they expect.

For static audiences, the user list is the editable list itself (add / remove members via the people picker).

Save updates via `PATCH /v1/inbox/audiences/:id`.
Delete (with confirmation modal) via `DELETE /v1/inbox/audiences/:id`.

### 4. Duplicate action

The list and detail pages have a "Duplicate" action that creates a copy with name "{Original} (copy)" and the same definition. Useful for tenants who want to start from an existing audience.

Implemented as a single API call sequence: `GET` the original → `POST` a new one with the modified name. No new endpoint needed.

### 5. Preview drawer

When the user clicks a row in the list page, a side drawer slides out from the end side showing the audience's resolved members (live preview). This is the same data the detail page shows under "Resolve now" — a quick peek without leaving the list.

The drawer has a "Open full view" button that navigates to `/inbox/audiences/[id]`.

### 6. Permission guard

The page is gated behind `inbox.send` (the same permission as compose — anyone who can send broadcasts can manage audiences). Parents and students never see this nav entry.

The Communications module sub-strip (in the existing morph bar) gains an "Audiences" entry that links here. Find the existing module sub-strip pattern and add the entry — don't re-architect the morph bar.

### 7. Translation keys

Add to `messages/en.json` and `messages/ar.json` under `inbox.audiences.*`:

- `inbox.audiences.title`
- `inbox.audiences.new`
- `inbox.audiences.kind.static`
- `inbox.audiences.kind.dynamic`
- `inbox.audiences.fields.name`
- `inbox.audiences.fields.description`
- `inbox.audiences.fields.members`
- `inbox.audiences.preview.count`
- `inbox.audiences.preview.refresh`
- `inbox.audiences.actions.duplicate`
- `inbox.audiences.actions.delete`
- `inbox.audiences.delete.confirm.title`
- `inbox.audiences.delete.confirm.body`
- `inbox.audiences.empty_state`
- `inbox.audiences.errors.name_taken`
- `inbox.audiences.errors.cycle_detected`
- `inbox.audiences.errors.too_deep`

## Tests

E2E:

- Navigate to `/inbox/audiences` → empty list initially (or seeded list if dev fixtures exist)
- Click "New" → pick Dynamic → compose `parents_school AND fees_in_arrears` → save → audience appears in list
- Open the saved audience → "Resolve now" → confirm member list matches the parents-in-arrears query
- Edit the audience → change the threshold → save → resolved count updates
- Duplicate → creates copy with "(copy)" suffix
- Delete (with confirmation) → removed from list
- Try to save with a duplicate name → inline `SAVED_AUDIENCE_NAME_TAKEN` error
- As a parent → no nav entry → direct URL access returns 403

## Watch out for

- **Reuse, don't duplicate.** The chip builder and people picker live in impl 11. Import them. If those components have hidden coupling to the compose dialog state, refactor them to take their state via props/context, not via the dialog parent.
- **Static audience editing.** When the user changes the member list of a static audience, the change is **immediate and lossy** — there's no version history. Any future broadcast targeting this audience will use the new list. Document this in the UI with a tooltip on the save button.
- **Dynamic audience cycle detection.** The composer at the API layer (impl 03) detects cycles via `SAVED_AUDIENCE_CYCLE_DETECTED`. Surface that error inline on the save button — the user might try to compose audience A referencing audience B which references A.
- **The "Resolve now" button** can return many thousands of users for a "school" provider. Paginate the resolved list (50 per page) and don't try to render the full list at once.
- **Don't trust the count cache.** If the user just saved a dynamic audience and immediately uses it in a compose, the count must reflect the freshly-resolved snapshot, not a stale cache.

## Deployment notes

- Web restart only.
- Smoke test:
  - Navigate to `/inbox/audiences` → empty list.
  - Create a "Year 5 Parents" dynamic audience using the `year_group_parents` provider.
  - Reuse it from the compose dialog → it appears in the saved-audience dropdown.
  - Send a broadcast to it → recipients match.
