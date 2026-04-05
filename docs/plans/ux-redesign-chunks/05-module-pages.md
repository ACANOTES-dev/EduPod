# Chunk 05 — Module Page Migration

## What This Does

Updates every module page to work with the new full-width layout (no sidebar). Applies the new card, table, stat card, and page header styling from the design spec. This is the widest-reaching chunk — it touches every page under `(school)/`.

## Pre-Read

- `docs/plans/ux-redesign-final-spec.md` — Section 5 (Module Pages), Section 6 (Component Token Reference)
- `packages/ui/src/components/` — existing shared components (stat-card, table-wrapper, etc.)

## What Changes

### Page Structure

Every module page should follow this structure:

```
Morph Bar ................ 56px  (from chunk 03)
Sub-Strip ................ 44px  (from chunk 04, if in a module)
Content Area ............. remaining height, overflow-y-auto
  ├── Page Header ........ title + actions row
  ├── Stat Cards ......... horizontal row (if applicable)
  └── Main Content ....... table, form, detail view, etc.
```

### Page Header Pattern

- **Title:** `heading-2` (18px, weight-600), `var(--color-text-primary)`
- **Description:** (optional) `small` (13px), `var(--color-text-secondary)`
- **Actions:** End-aligned, primary + secondary buttons
- **Spacing:** 32px page padding, 24px gap between header and content

### Stat Cards Pattern

- **Layout:** Horizontal row, 16px gap, flex-wrap on mobile
- **Each card:** `var(--color-surface)` bg, 1px `var(--color-border)`, 16px radius (`--radius-lg`), 16px padding
- **Label:** `label` token (11px, weight-600, uppercase, `var(--color-text-tertiary)`)
- **Value:** `stat-value` token (28px, weight-700, `var(--color-text-primary)`)
- **Semantic values:** Use `var(--color-danger-text)` for overdue/negative, `var(--color-success-text)` for positive

### Table Pattern

- **Container:** `var(--color-surface)` bg, 1px `var(--color-border)`, 16px radius
- **Header row:** `var(--color-surface-secondary)` bg, `label` token, `var(--color-text-tertiary)`
- **Data rows:** `body` token, `var(--color-text-secondary)`, 1px bottom border `var(--color-surface-secondary)`
- **Row hover:** `var(--color-surface-hover)`
- **Status badges:** Pill shape (9999px radius), semantic colours
- **Wrapped in:** `overflow-x-auto` div

### Button Updates

All buttons across pages should use the updated shape:

- **Border radius:** `9999px` (pill) — not the old 6-8px rounded
- **Primary:** `var(--color-primary-700)` bg, `var(--color-btn-primary-text)` text
- **Secondary:** `var(--color-primary-50)` bg, `var(--color-primary-700)` text
- **Outline:** transparent bg, `var(--color-text-primary)` text, `var(--color-border-strong)` border
- **Ghost:** transparent bg, `var(--color-text-secondary)` text
- **Danger:** `var(--color-danger-fill)` bg, `var(--color-danger-text)` text

## Files to Modify

### 1. `packages/ui/src/components/button.tsx`

Update the default border radius to pill (9999px). Update variant color mappings to use the new token names.

### 2. `packages/ui/src/components/stat-card.tsx`

Update to use the new styling: 16px radius, label token for the label, stat-value token for the value.

### 3. `packages/ui/src/components/badge.tsx` / `status-badge.tsx`

Update to pill shape (9999px radius). Ensure semantic colours use the CSS variables.

### 4. Every `(school)/` page that has stat cards, tables, or page headers

This is the bulk of the work. For each module page:

- Verify page padding is 32px (`p-8`)
- Verify stat cards use the new pattern
- Verify tables use the new container styling
- Verify buttons are pill-shaped
- Verify no hardcoded colours

**Priority pages (highest traffic, check first):**

- `/dashboard` (home)
- `/students` (list + detail)
- `/finance/invoices` (list + detail)
- `/attendance` (mark + view)
- `/classes` (list + detail)
- `/staff` (list + detail)

## Approach

Do NOT rewrite every page file individually. Instead:

1. Update the shared components in `@school/ui` (button, stat-card, badge, table-wrapper) — this propagates to all pages automatically.
2. Check the 6 priority pages above and fix any page-specific styling that doesn't pick up the shared component updates.
3. Do a visual sweep of remaining pages to catch outliers.

## Verification

1. Every page has full-width content (no 260px gap where sidebar was).
2. Stat cards have the warm surface styling with 16px radius.
3. Tables have the surface container with hover states.
4. Buttons are pill-shaped across all pages.
5. No hardcoded color hex values in any page component.
6. Page padding is consistent at 32px.
7. RTL: all layouts mirror correctly with logical properties.
8. Dark mode: warm surfaces, readable text, correct semantic colours.

## What NOT to Change

- Do not redesign the home page content layout (chunk 06).
- Do not change form structures or validation logic.
- Do not change API calls or data fetching patterns.
- Do not add new features or change existing behaviour.
