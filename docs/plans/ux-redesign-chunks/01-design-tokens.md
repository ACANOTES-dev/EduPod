# Chunk 01 — Design Token System (Warm Stone)

## What This Does

Replaces the current cool grey/stone CSS variable palette with the "Warm Stone" palette from the design spec. This is the foundation — every subsequent chunk depends on these tokens existing.

## Pre-Read

- `docs/plans/ux-redesign-final-spec.md` — Sections 2 (Colour System), 6 (Component Token Reference), 7 (Token Architecture), 8 (Dark Mode Principles)
- `packages/ui/src/globals.css` — current token definitions (this file gets rewritten)
- `packages/ui/tailwind.config.ts` — current Tailwind theme mapping

## Files to Modify

### 1. `packages/ui/src/globals.css`

Replace the entire `:root` and `.dark` blocks with the Warm Stone palette. The new tokens are:

**Light mode (`:root`):**

```css
:root {
  /* Background & Surface */
  --color-background: #faf9f7;
  --color-surface: #ffffff;
  --color-surface-secondary: #f5f4f1;
  --color-surface-hover: #f0efec;
  --color-border: #e7e5e1;
  --color-border-strong: #d6d3ce;

  /* Text */
  --color-text-primary: #1c1917;
  --color-text-secondary: #6b6560;
  --color-text-tertiary: #9c9590;

  /* Primary — Emerald */
  --color-primary-50: #ecfdf5;
  --color-primary-100: #d1fae5;
  --color-primary-500: #10b981;
  --color-primary-600: #059669;
  --color-primary-700: #047857;
  --color-primary-800: #065f46;
  --color-primary-900: #064e3b;

  /* Morph Bar */
  --color-bar-bg: #1c1917;
  --color-bar-text: rgba(250, 250, 249, 0.5);
  --color-bar-text-active: #6ee7b7;
  --color-bar-active-bg: rgba(16, 185, 129, 0.2);

  /* Sub-Strip */
  --color-strip-bg: #292524;
  --color-strip-text: rgba(250, 250, 249, 0.4);
  --color-strip-text-active: #fafaf9;
  --color-strip-active-bg: rgba(255, 255, 255, 0.1);
  --color-strip-border: #3f3b39;

  /* Semantic */
  --color-success-fill: #ecfdf5;
  --color-success-text: #065f46;
  --color-warning-fill: #fffbeb;
  --color-warning-text: #92400e;
  --color-danger-fill: #fff1f2;
  --color-danger-text: #9f1239;
  --color-danger-dot: #f43f5e;
  --color-info-fill: #eff6ff;
  --color-info-text: #1e40af;

  /* Button */
  --color-btn-primary-text: #ffffff;

  /* Radius — updated to spec */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-pill: 9999px;
}
```

**Dark mode (`.dark`):**

```css
.dark {
  /* Background & Surface */
  --color-background: #1a1816;
  --color-surface: #242120;
  --color-surface-secondary: #2d2926;
  --color-surface-hover: #353130;
  --color-border: #3a3532;
  --color-border-strong: #4a4440;

  /* Text */
  --color-text-primary: #f5f0eb;
  --color-text-secondary: #c8c0b8;
  --color-text-tertiary: #9c9590;

  /* Primary — Emerald Dark */
  --color-primary-50: rgba(16, 185, 129, 0.1);
  --color-primary-100: rgba(16, 185, 129, 0.15);
  --color-primary-500: #10b981;
  --color-primary-600: #34d399;
  --color-primary-700: #6ee7b7;
  --color-primary-800: #047857;
  --color-primary-900: #064e3b;

  /* Morph Bar */
  --color-bar-bg: #12100e;
  --color-bar-text: rgba(245, 240, 235, 0.4);
  --color-bar-text-active: #6ee7b7;
  --color-bar-active-bg: rgba(16, 185, 129, 0.2);

  /* Sub-Strip */
  --color-strip-bg: #1e1b19;
  --color-strip-text: rgba(245, 240, 235, 0.35);
  --color-strip-text-active: #f5f0eb;
  --color-strip-active-bg: rgba(255, 255, 255, 0.08);
  --color-strip-border: #2a2623;

  /* Semantic */
  --color-success-fill: rgba(16, 185, 129, 0.1);
  --color-success-text: #6ee7b7;
  --color-warning-fill: rgba(245, 158, 11, 0.1);
  --color-warning-text: #fbbf24;
  --color-danger-fill: rgba(244, 63, 94, 0.1);
  --color-danger-text: #fb7185;
  --color-danger-dot: #fb7185;
  --color-info-fill: rgba(59, 130, 246, 0.1);
  --color-info-text: #60a5fa;

  /* Button */
  --color-btn-primary-text: #ffffff;
}
```

### 2. `packages/ui/tailwind.config.ts`

Add new token mappings to the Tailwind theme:

- Add `surface-hover` to the colors map: `'surface-hover': 'var(--color-surface-hover)'`
- Add `bar-bg`, `bar-text`, `bar-text-active`, `bar-active-bg` to colors
- Add `strip-bg`, `strip-text`, `strip-text-active`, `strip-active-bg`, `strip-border` to colors
- Add `btn-primary-text` to colors
- Add `danger-dot`, `warning-dot`, `info-dot` to colors
- Update borderRadius: add `pill: '9999px'`
- Ensure existing color references still resolve (no renames — only additions)

## Verification

After this chunk:

1. `pnpm dev` — the app should render without visual breakage. Colours will shift slightly warmer but the layout is unchanged.
2. Toggle dark mode — verify warm brown-black background (`#1A1816`), not cool black.
3. Check that emerald accents (active sidebar items, primary buttons) still look correct.
4. Check text readability — `--color-text-secondary` changed from `#78716C` to `#6B6560` (slightly warmer, slightly darker).
5. Verify no component uses hardcoded hex values that bypass the token system. If any are found, update them to use the CSS variables.

## What NOT to Change

- Do not touch layout files, navigation, or component structure.
- Do not rename existing CSS variable names — only update their values and add new ones.
- Do not modify the Tailwind `@tailwind` directives or the `@layer base` wrapper.
