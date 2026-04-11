# Implementation 13 — Messaging Policy Settings Page

> **Wave:** 4 (parallel with 10, 11, 12, 14, 15)
> **Depends on:** 01, 02
> **Deploys:** Web restart only

---

## Goal

The **tenant settings page** where Owner / Principal / Vice Principal configure the messaging policy: the role-pair grid, the global kill switches, the edit window, the retention period. This is the UI for the policy engine built in impl 02.

## What to build

### 1. The settings page route

`apps/web/src/app/[locale]/(school)/settings/communications/messaging-policy/page.tsx`

The page lives under the existing `settings/communications/` area. Add a new entry to the existing settings nav: "Messaging Policy".

Page layout:

- **Page header** — title "Messaging Policy", description, "Reset to defaults" button (with confirmation modal)
- **Section 1: Global controls** — the kill switches
- **Section 2: Role permission matrix** — the 9×9 grid
- **Section 3: Edit & retention** — edit window minutes, retention days
- **Save** button (sticky at the bottom)

### 2. Section 1 — Global controls

Each kill switch is a labelled toggle with a description tooltip:

- **Messaging enabled** — master switch for the whole inbox
- **Students can initiate conversations** — default OFF, with a warning callout when toggled ON
- **Parents can initiate conversations** — default OFF
- **Allow parent ↔ parent messaging** — default OFF
- **Allow student ↔ student messaging** — default OFF
- **Allow student → parent messaging** — default OFF
- **Require admin approval for parent → teacher messages** — default OFF, with a "(coming soon)" badge — the v1 UI surfaces the toggle but the workflow lands in v2 (column already exists in `tenant_settings_inbox`)

Each toggle is a `<Switch>` from `@school/ui` with helper text below.

### 3. Section 2 — Role permission matrix

The 9×9 grid (sender rows × recipient columns). Roles:

`owner`, `principal`, `vice_principal`, `office`, `finance`, `nurse`, `teacher`, `parent`, `student`

Visual:

- Each cell is a toggle (checkbox or pill).
- Diagonal cells (sender → same role) are still meaningful (e.g. `teacher → teacher`), so they're enabled.
- Hovering a cell shows: "**{sender_role}** can message **{recipient_role}**" + the relational scope rule from impl 02 (e.g., "Teachers can only message parents of students in their own classes — this scope is hard-coded and cannot be changed.").
- Clicking a cell toggles it.
- The grid uses CSS Grid for the layout. Roles labels are sticky on the start side and top.

The grid component is a single React component, not 81 individual checkboxes. State is a `Map<string, boolean>` keyed on `${sender}:${recipient}`.

For the responsive constraint: at narrow widths (<768px), the grid becomes a vertical stack of "From {role} →" sections, each containing a checkbox list of the recipient roles. CSS Grid + media queries handles this — no separate component.

### 4. Section 3 — Edit & retention

Two number inputs with helper labels:

- **Edit window (minutes)** — default 10. Range 0–60. Description: "Senders (school staff only) can edit their messages for this many minutes after sending. Set to 0 to disable editing."
- **Retention period (days)** — default null (forever). Optional. Description: "Messages older than this are deleted automatically. Leave blank to keep messages forever."

A small GDPR notice below: "Setting a retention period helps comply with GDPR data minimisation. The platform deletes messages permanently — for safeguarding records, export important conversations before retention runs."

(The retention enforcement worker is **not part of this implementation**. The setting is captured; the enforcement worker is a future implementation. Add a clearly labelled TODO comment in `IMPLEMENTATION_LOG.md` follow-ups so it's tracked.)

### 5. The form mechanics

`react-hook-form` + `zodResolver` against a new schema in `packages/shared/src/inbox/schemas/inbox-settings.schema.ts`:

```ts
export const updateInboxSettingsSchema = z.object({
  messaging_enabled: z.boolean(),
  students_can_initiate: z.boolean(),
  parents_can_initiate: z.boolean(),
  parent_to_parent_messaging: z.boolean(),
  student_to_student_messaging: z.boolean(),
  student_to_parent_messaging: z.boolean(),
  require_admin_approval_for_parent_to_teacher: z.boolean(),
  edit_window_minutes: z.number().int().min(0).max(60),
  retention_days: z.number().int().positive().nullable(),
});

export const updateMessagingPolicySchema = z.object({
  cells: z.array(
    z.object({
      sender_role: z.enum([...MESSAGING_ROLES]),
      recipient_role: z.enum([...MESSAGING_ROLES]),
      allowed: z.boolean(),
    }),
  ),
});
```

The page submits **two** API calls in parallel on save:

- `PUT /v1/inbox/settings/inbox` — body matches `updateInboxSettingsSchema`
- `PUT /v1/inbox/settings/policy` — body matches `updateMessagingPolicySchema`

Both endpoints land in this implementation as the **mutation companions** to the read endpoints from impl 02:

`apps/api/src/modules/inbox/settings/inbox-settings.controller.ts`

```
PUT /v1/inbox/settings/inbox            → behind @RequiresPermission('inbox.settings.write')
PUT /v1/inbox/settings/policy           → behind @RequiresPermission('inbox.settings.write')
POST /v1/inbox/settings/policy/reset    → resets the matrix to defaults from packages/shared/src/inbox/permission-defaults.ts
```

The mutations:

- Validate via Zod
- Run inside an interactive RLS transaction
- Invalidate the policy cache for the tenant (call `MessagingPolicyService.invalidateCacheForTenant(tenantId)`)
- Audit-log via the existing audit interceptor (the writes are routine settings changes, not oversight reads — the standard audit covers them)

### 6. Confirmation modals

Sensitive changes get a confirmation modal:

- Toggling **Messaging enabled** OFF → "This disables the entire inbox for everyone in your school. Are you sure?"
- Toggling **Students can initiate** ON → "This lets students initiate conversations with anyone the matrix allows. Make sure your matrix is configured."
- Toggling **Parents can initiate** ON → similar
- "Reset to defaults" button → "This resets the matrix to the platform defaults. Your custom configuration will be lost."

### 7. Permission guard

The page is gated behind `inbox.settings.read` for viewing and `inbox.settings.write` for saving. Owner / Principal / Vice Principal only — the existing role-permission seed handles this.

Belt and braces: also wrap the route in the existing settings layout's admin-tier check if one exists.

## Tests

E2E:

- Navigate as Principal → page loads with current matrix and settings
- Toggle a cell → save → reload → cell remains toggled
- Toggle "Messaging enabled" off → confirmation modal → save → all inbox UIs surface "Inbox disabled"
- Click "Reset to defaults" → confirmation → matrix returns to seeded defaults
- As Teacher → page returns 403
- As Parent → no nav entry visible

Component:

- Matrix grid renders 81 cells
- Cell toggle updates internal state without losing other cells
- Mobile breakpoint collapses the grid to a stacked list
- Tooltip on a cell shows the relational scope rule

## Watch out for

- **Cache invalidation.** When the matrix is updated, the policy cache (5-min LRU per tenant) MUST be invalidated. Without this, users continue to be governed by the OLD matrix until the cache expires. `MessagingPolicyService.invalidateCacheForTenant` is the API.
- **Default matrix integrity.** The "Reset to defaults" button uses `packages/shared/src/inbox/permission-defaults.ts` — the same source the impl 01 seed uses. If the defaults are ever changed there, both new tenants and reset operations stay consistent.
- **The matrix is 81 cells (9×9).** Diagonal cells (e.g. `parent → parent`) are real and editable — they're how `parent_to_parent_messaging` interacts with the kill switch. The kill switch is the "and gate", the cell is the "consent gate". If the cell is OFF, parent-to-parent never happens regardless of the kill switch. If the cell is ON but the kill switch is OFF, it still never happens. Both must be ON.
- **Visually distinguish "off because kill switch" vs "off because cell".** When the parent → parent kill switch is OFF, all parent-to-parent cells should appear visually disabled (greyed) with a tooltip "Disabled by global kill switch above". This prevents user confusion.
- **The relational scope tooltip is informational only.** Users cannot edit it. Make sure the tooltip text is clear that the scope is enforced regardless of the cell state.

## Deployment notes

- Web restart only.
- Smoke test:
  - Login as Principal → navigate to `/settings/communications/messaging-policy` → page renders with the seeded matrix.
  - Toggle parent → teacher cell to ON → save → confirm a parent can now compose to their child's teacher (test in inbox).
  - Toggle it back to OFF → save → confirm parent loses access immediately (force a fresh page load to bypass the cache; the cache invalidation should also handle this).
  - Click "Reset to defaults" → matrix reverts.
  - Login as Teacher → 403 on the settings page.
