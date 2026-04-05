# Chunk 10 — Polish Pass

## What This Does

Adds the finishing touches that make the product feel premium: transitions, animations, skeleton loading states, empty states, and micro-interactions. This is the "someone genuinely cared about this" layer.

## Pre-Read

- `docs/roadmap/Phase-2/ux-redesign-vision.md` — the emotional intent (especially "Beautiful Transitions, Natural Flow")
- `docs/plans/ux-redesign-final-spec.md` — all animation specs scattered throughout

## Transitions & Animations

### 1. Page Transitions

When navigating between pages within a module:

- Content area fades in: opacity 0 → 1, 150ms ease-out
- Optionally: slight upward slide (translateY 8px → 0)
- Use CSS transitions on the `<main>` content wrapper, triggered by route change

### 2. Morph Bar Transitions

Already specified in chunks 03-04, verify they work:

- Sub-strip slide down: 200ms ease-out
- Sub-strip slide up: 200ms ease-in
- Module switch: sub-strip content crossfade 150ms
- Hub pill hover: bg color transition 150ms

### 3. Card & Element Transitions

- **Stat card values:** Numbers count up on initial load (use a simple counter animation, 0.6s ease)
- **Progress bars:** Width animates from 0 to final value on load (0.6s ease, staggered by 100ms per bar)
- **Table row hover:** Background color transition 100ms
- **Button hover:** Background color transition 150ms
- **Card hover (where clickable):** Subtle shadow increase + border color shift to `var(--color-border-strong)`, 150ms

### 4. Live Pulse Dot

On the home page greeting row, the emerald pulse dot:

```css
@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(1.3);
  }
}
.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: var(--color-primary-500);
  animation: pulse-dot 2s ease-in-out infinite;
}
```

## Skeleton Loading States

Every data-fetching section needs a skeleton state that matches its final layout:

### Home Page Skeletons

- **Priority feed:** 3 skeleton items: 36px square + 2 line bars + button bar
- **Activity feed:** 4 skeleton items: circle + 2 line bars
- **School snapshot:** 4 skeleton rows: icon square + label bar + value bar
- **This week:** 3 skeleton bars: label + progress bar
- **Quick actions:** 6 skeleton pills

### Module Page Skeletons

- **Table:** Header row + 5 data rows of varying-width bars
- **Stat cards:** 4 skeleton cards with label bar + value bar
- **Detail page:** Title bar + 3 section skeletons

### Skeleton Styling

- Background: `var(--color-surface-secondary)` with a shimmer animation
- Shimmer: left-to-right gradient sweep, 1.5s linear infinite
- Border radius: matches the element it replaces (pill for buttons, 16px for cards, etc.)

```css
@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-surface-secondary) 25%,
    var(--color-surface-hover) 50%,
    var(--color-surface-secondary) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s linear infinite;
}
```

## Empty States

Every list/table page needs an empty state when there's no data:

- **Illustration:** Simple, warm-toned SVG or icon (not generic clipart)
- **Heading:** `heading-3`, descriptive ("No invoices yet")
- **Description:** `small`, `var(--color-text-tertiary)`, actionable ("Create your first invoice to get started")
- **CTA button:** Primary pill button ("Create Invoice")
- **Centered** in the content area, vertically offset slightly above center

Update or verify the existing `packages/ui/src/components/empty-state.tsx` component matches these specs.

## Notification Bell Polish

- Badge: emerald-700 bg, white text, pill shape, 18px diameter
- If count > 9, show "9+"
- If count = 0, no badge
- Bell icon subtle bounce on new notification (CSS animation, once, 300ms)

## Focus States

All interactive elements need visible focus states for keyboard navigation:

- **Default focus ring:** 2px `var(--color-primary-500)`, 2px offset
- **Dark surfaces (morph bar, sub-strip):** 2px `var(--color-bar-text-active)`, 2px offset
- Use `focus-visible` (not `focus`) to avoid showing rings on mouse click

## Verification Checklist

- [ ] Sub-strip slides smoothly when entering/leaving modules
- [ ] Page content fades in on navigation
- [ ] Stat numbers count up on home page
- [ ] Progress bars animate on home page
- [ ] Pulse dot animates on greeting row
- [ ] Skeleton loading shows before data loads (throttle network in DevTools to verify)
- [ ] Empty states show when filtering produces no results
- [ ] Button/card hover transitions are smooth (no snapping)
- [ ] Focus rings visible on keyboard tab navigation
- [ ] All animations respect `prefers-reduced-motion` — add media query to disable:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```
- [ ] RTL: animations direction-aware (slide from correct side)
- [ ] Dark mode: skeletons use warm tones, not cool grey

## What NOT to Change

- Do not add new features or functionality.
- Do not change data fetching patterns.
- Do not modify the design token values (those are locked in chunk 01).
- Do not add heavy animation libraries — CSS transitions and keyframes are sufficient.
