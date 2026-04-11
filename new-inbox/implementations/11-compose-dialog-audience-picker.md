# Implementation 11 — Compose Dialog + Audience Picker + Channel Selector

> **Wave:** 4 (parallel with 10, 12, 13, 14, 15)
> **Depends on:** 01, 02, 03, 04, 06, 10
> **Deploys:** Web restart only

---

## Goal

Build the **compose UI** — the dialog that lets a user start a new conversation. Three flavours: direct, group, broadcast. Includes the audience picker (single recipient, multi recipient, or smart-audience builder), the channel selector (inbox always-on, optional SMS / Email / WhatsApp), the attachment uploader, the reply-toggle for broadcasts, and the search results page that the search bar in impl 10 navigates to.

## What to build

### 1. The compose dialog

`apps/web/src/app/[locale]/(school)/inbox/_components/compose-dialog.tsx`

A full-screen modal (mobile) or a side-panel sheet (desktop). Tabs across the top: **Direct** | **Group** | **Broadcast**.

The user picks the tab first; the body of the dialog swaps to the appropriate form. State is managed by `react-hook-form` + `zodResolver` against the schemas from `packages/shared/src/inbox/schemas/`.

#### Direct tab

Fields:

- **Recipient** — single-select people picker (component below)
- **Body** — multi-line `<Textarea>`, autosize
- **Attachments** — drag-drop zone + click-to-upload
- **Channels** — inbox (always on, locked checkbox), email, sms, whatsapp
- **Don't escalate** — checkbox (sets `disable_fallback`)
- **Send** button

Schema: `sendDirectSchema` from impl 04's shared package.

#### Group tab

Fields:

- **Subject** — single-line `<Input>`, required
- **Recipients** — multi-select people picker (chips)
- **Body**, **Attachments**, **Channels**, **Don't escalate** — same as direct

Validates 2 ≤ recipients ≤ 49. Real-time count under the recipients field.

#### Broadcast tab

Fields:

- **Subject** — required
- **Audience** — the smart audience picker (component below)
- **Allow replies** — checkbox, default OFF, prominent. Tooltip: "If enabled, recipients can reply to you privately. Otherwise, this is a one-way announcement."
- **Body**, **Attachments**, **Channels**, **Don't escalate**

The audience picker is the heart of the broadcast tab — see §3 below.

### 2. People picker

`apps/web/src/app/[locale]/(school)/inbox/_components/people-picker.tsx`

Two modes: `single` and `multi`. Used by direct (single) and group (multi).

Renders an `<Input>` that shows a search dropdown of users in the tenant when typed. Uses a new endpoint:

`GET /v1/inbox/people-search?q=...&limit=20`

Implemented in **this implementation** (small backend addition):

`apps/api/src/modules/inbox/people-search/people-search.controller.ts`

```ts
@Get('/v1/inbox/people-search')
@UseGuards(AuthGuard, PermissionGuard)
@RequiresPermission('inbox.send')
async search(@Query('q') q: string, @CurrentTenant() tenant) {
  // Search active users in the tenant by display_name / email / role.
  // Apply policy filtering: a teacher's people search only shows users they CAN message (per policy).
  // Use MessagingPolicyService.canStartConversation in batch mode to filter the list.
  // Returns: [{ user_id, display_name, role_label, avatar_url }]
}
```

The crucial bit: **the people-search endpoint applies the policy matrix to filter the list**. A teacher searching for parents only sees parents of their own students. A parent searching for teachers only sees their child's teachers. The policy engine from impl 02 is reused via its batch path.

Picker UX:

- Type to search (debounced 200ms)
- Up/down arrow keys to navigate results
- Enter to select
- Selected users appear as chips above the input
- Click the X on a chip to remove

### 3. The smart audience picker

`apps/web/src/app/[locale]/(school)/inbox/_components/audience-picker.tsx`

This is the broadcast-tab audience component. Three modes the user toggles between:

#### Mode A — Quick chip select

A row of preset chips: `Whole school`, `All parents`, `All staff`, `All teachers`, plus year-group / class chips fetched from the academic structure. Click a chip → it's the audience.

#### Mode B — Saved audience

A dropdown listing the tenant's saved audiences (from `GET /v1/inbox/audiences`). Pick one → it's the audience. Each option shows the audience name + last-resolved count + kind badge (static / dynamic).

#### Mode C — Custom builder

The full chip composer. The user clicks "Build custom audience" and gets a sub-component:

`apps/web/src/app/[locale]/(school)/inbox/_components/audience-chip-builder.tsx`

The builder is a vertical stack of "rows", each row is a provider invocation. Between rows is an operator selector (AND / OR). A row can be wrapped in a NOT.

Adding a row:

1. Click "+ Add filter"
2. Pick a provider from a dropdown — populated by `GET /v1/inbox/audiences/providers`. Each provider shows its display name and a `wired: false` badge if it's a stub.
3. Fill in the params (form fields generated from the provider's `paramsSchema`).
4. The row is added.

Each row has a real-time count preview ("≈ 142 recipients") fetched via `POST /v1/inbox/audiences/preview`. The count refreshes 500ms after the user stops editing the row.

The total count for the whole composition (with operators applied) is shown at the bottom: "**142 recipients will receive this**" — this comes from one final `POST /v1/inbox/audiences/preview` call against the full composed definition.

A "Save as audience..." button at the bottom opens a small dialog: name + description + save. Posts to `POST /v1/inbox/audiences` with `kind: 'dynamic'`.

### 4. The channel selector

`apps/web/src/app/[locale]/(school)/inbox/_components/channel-selector.tsx`

A row of four checkboxes:

- **Inbox** — checked, disabled, label "Always sent — free"
- **Email** — togglable, label "Email — €0.001 per recipient" (cost label is a placeholder, configurable per tenant later)
- **SMS** — togglable, label "SMS — €0.05 per recipient"
- **WhatsApp** — togglable, label "WhatsApp — €0.02 per recipient"

The cost labels are read from a new tenant settings endpoint or hardcoded for v1 (decision point — go with hardcoded constants in `packages/shared/src/inbox/channel-costs.ts` for v1; tenant-configurable cost labels are out of scope).

Below the row, a small total: "Estimated cost: **€7.10** for 142 recipients" — sum of selected channel costs × recipient count. Updates in real time as the user toggles.

The estimate is informational only — the actual billing is handled elsewhere. The label is a UX nudge to keep tenants on the cheapest channel.

### 5. The attachment uploader

`apps/web/src/app/[locale]/(school)/inbox/_components/attachment-uploader.tsx`

A drag-drop zone with click-to-browse fallback. Uses the existing storage upload endpoint (`POST /v1/storage/upload` or whatever the platform pattern is — find it in the existing student docs uploader and reuse).

Each uploaded file becomes a chip with filename + size + remove button. Failed uploads show an error chip with a retry button.

Validates client-side:

- Max 10 files per message
- Max 25MB per file
- Mime type allowlist (image/\*, application/pdf, office documents, text/plain) — same as the backend list in impl 04

The uploader returns `{ storage_key, filename, mime_type, size_bytes }` for each successful upload, which is what the form submits as `attachments`.

### 6. The search results page

`apps/web/src/app/[locale]/(school)/inbox/search/page.tsx`

The destination of the inbox sidebar's search bar from impl 10.

- Reads `?q=...` and `?page=...` from URL
- Calls `GET /v1/inbox/search?q=...&page=...`
- Renders results grouped by conversation
- Each result shows the body snippet with `<mark>` highlights (server-rendered via `ts_headline`)
- Click a result → navigate to `/inbox/threads/:conversation_id`
- Pagination at the bottom

Empty state: "No messages found for **{query}**. Try fewer or different words."

The `<mark>` HTML is sanitised through a small allowlist: only `<mark>` and `</mark>` tags survive, everything else is escaped. Use a small inline sanitiser (no extra deps).

### 7. The compose entry points

The "Compose" button in the inbox sidebar (impl 10) opens this dialog. Also:

- A FAB (floating action button) on mobile in the inbox shell
- A keyboard shortcut: `c` opens compose when focused in the inbox

### 8. Form submission

On submit, the dialog:

1. Validates with the Zod schema (already wired by `zodResolver`)
2. Calls the appropriate API: `POST /v1/inbox/conversations/direct`, `/group`, or `/broadcast`
3. On success: closes the dialog, navigates to `/inbox/threads/:new_id`, the polling layer (impl 10) picks up the new thread on the next tick
4. On failure: shows a toast with the error code and message, doesn't close the dialog

Error handling for the broadcast path:

- `BROADCAST_AUDIENCE_EMPTY` → toast "Your audience is empty after policy filtering. Adjust the audience or your messaging policy."
- Per-recipient denials in group → list the denied users in a modal "These recipients couldn't be reached: ..."

## Tests

E2E:

- Open compose, send a direct message → message appears in recipient's inbox within 30s
- Open compose group, pick 5 recipients, send → group conversation created, all 5 receive
- Open compose broadcast, pick "All parents", tick "Allow replies", send → broadcast conversation created, parents receive, parents can reply
- Open compose broadcast, build custom audience (year_group_parents AND fees_in_arrears), preview shows count, send
- Save a custom audience as dynamic → it appears in the saved audiences list, reusable next time
- Channel selector: ticking SMS shows the cost estimate
- Attachment upload: drag a file, upload succeeds, send includes the storage_key
- People picker: as a teacher, search for parents → only parents of own students appear

Component:

- `audience-chip-builder` adds and removes rows correctly
- `channel-selector` cost calculation
- `people-picker` keyboard navigation

## Watch out for

- **Form validation must match the backend Zod schemas exactly.** Any drift between frontend and backend causes silent send failures. Import the schemas directly from `@school/shared/inbox/schemas` rather than re-defining.
- **The audience preview call is debounced**, but the chip builder fires lots of intermediate previews while the user types. Cancel in-flight previews on new input (`AbortController`).
- **`react-hook-form` + Zod is mandatory.** Per CLAUDE.md frontend rules, no hand-rolled `useState` per field for new forms.
- **People picker policy filtering** is the privacy guard for teachers and parents. Without it, a teacher could see all parents in the people search even though they can't actually message them. Run an explicit test as a teacher with two students from one class: search for "parent" and assert only those two parents' parents appear.
- **The save-as-audience flow** creates a `dynamic` saved audience by default. A user wanting a static "snapshot" can save it after a manual handpicked build. Don't expose the kind discriminator in the form — infer from the chosen mode.
- **Attachment storage keys** must be validated server-side (impl 04 already does this via `StorageFacade.assertOwnedByTenant`). Don't trust the client.
- **Mobile compose** is full-screen, not a side sheet. Smaller screens need every pixel.
- **The "cost" labels are not real billing**. Document this in a code comment so a future engineer doesn't try to wire them to Stripe. They are UX nudges.

## Deployment notes

- Web restart only.
- Smoke test:
  - Compose direct from Principal → Teacher → arrives in teacher's inbox.
  - Compose broadcast from Principal → "All parents" → arrives in every parent's inbox.
  - Compose broadcast with custom audience (parents in arrears) → arrives only at parents flagged in arrears.
  - Save the custom audience → reuse it on the next broadcast.
  - Search "test" → results page renders highlighted snippets.
