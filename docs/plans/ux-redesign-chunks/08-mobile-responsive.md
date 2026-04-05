# Chunk 08 — Mobile Responsive Pass

## What This Does

Adapts the morph bar, sub-strip, and home page for mobile breakpoints (< 1024px). Replaces the old sidebar mobile drawer with a dark overlay panel.

## Pre-Read

- `docs/plans/ux-redesign-final-spec.md` — Section 3a (Mobile behaviour), Section 4 (Mobile Layout)
- `packages/ui/src/components/morph-bar/` — all morph bar components
- `packages/ui/src/components/app-shell/mobile-sidebar.tsx` — old mobile sidebar (reference for patterns, will be replaced)

## Changes

### 1. Morph Bar Mobile (< 1024px)

**Current state:** The morph bar shows all hub pills, which don't fit on small screens.

**New behaviour:**

- Hub pills are replaced by a hamburger icon (top-start) that opens a dark overlay panel
- The bar shrinks to: `[☰] EduPod ... [🔔] [👤]`
- Search pill is hidden on mobile (accessible via ⌘K or from the overlay panel)

### 2. Mobile Navigation Overlay

New component: `packages/ui/src/components/morph-bar/mobile-nav-overlay.tsx`

- **Trigger:** Hamburger icon in morph bar
- **Appearance:** Full-screen dark overlay (`var(--color-bar-bg)` with 95% opacity backdrop)
- **Content:** Hub items listed vertically, each as a large touch target (min 48px height)
- **Active hub:** Emerald highlight
- **Close:** X button (top-end) or tap backdrop
- **Animation:** Slide in from the start side, 200ms ease-out

### 3. Sub-Strip Mobile

**Current state:** Sub-strip tabs don't fit on small screens.

**New behaviour:**

- Transforms to a horizontally scrollable pill row
- `overflow-x-auto` with `-webkit-overflow-scrolling: touch`
- Optional: fade hint on the end side to indicate more tabs (CSS gradient mask)
- "More ▾" dropdown still works on mobile
- Height remains 44px

### 4. Home Page Mobile

Already partially handled in chunk 06. Verify:

- Right column (context panel) stacks below the left column
- Quick actions: horizontal scrollable pill row
- School snapshot: 2x2 compact grid
- Priority/activity feed: full width

### 5. Module Pages Mobile

Verify all module pages work at 375px width (iPhone SE):

- Tables: wrapped in `overflow-x-auto`
- Stat cards: flex-wrap to stack vertically
- Page padding: reduce from 32px to 16px (`p-4`) on mobile
- Action buttons in page headers: collapse to a single menu or stack

## Files to Modify

- `packages/ui/src/components/morph-bar/morph-bar.tsx` — add mobile variant with hamburger
- `packages/ui/src/components/morph-bar/mobile-nav-overlay.tsx` — new file
- `packages/ui/src/components/morph-bar/sub-strip.tsx` — add horizontal scroll for mobile
- `apps/web/src/app/[locale]/(school)/layout.tsx` — wire up mobile overlay state
- Various page files — verify responsive behavior, add `p-4 lg:p-8` where needed

## Breakpoints

| Breakpoint      | Behaviour                                           |
| --------------- | --------------------------------------------------- |
| < 640px (sm)    | Mobile: hamburger nav, stacked layout, 16px padding |
| 640-1023px (md) | Tablet: hamburger nav, some side-by-side layouts    |
| ≥ 1024px (lg)   | Desktop: full morph bar with hub pills              |

## Verification

1. At 375px width: hamburger menu appears, hub pills hidden.
2. Tapping hamburger opens dark overlay with hub list.
3. Sub-strip tabs scroll horizontally on mobile.
4. Home page: single column, no overflow.
5. Tables don't cause horizontal page overflow.
6. All touch targets are ≥ 44px.
7. Input font-size is ≥ 16px (prevents iOS zoom).
8. RTL: hamburger on end side, overlay slides from end.
9. Dark mode: overlay is appropriately dark.

## What NOT to Change

- Do not add a bottom tab bar — the spec mentions it as "to be decided." Skip for now.
- Do not change any data fetching or API patterns.
- Do not modify desktop layouts — only add responsive breakpoints.
