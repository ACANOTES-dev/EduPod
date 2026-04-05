# Chunk 02 — Font Swap (Plus Jakarta Sans → Figtree)

## What This Does

Replaces Plus Jakarta Sans with Figtree as the primary font. Updates the type scale tokens to match the spec.

## Pre-Read

- `docs/plans/ux-redesign-final-spec.md` — Section 1 (Typography)
- `apps/web/src/lib/fonts.ts` — current font imports
- `packages/ui/src/globals.css` — font variable definitions
- `packages/ui/tailwind.config.ts` — font family config

## Files to Modify

### 1. `apps/web/src/lib/fonts.ts`

Replace the Plus Jakarta Sans import with Figtree:

```typescript
import { Figtree, JetBrains_Mono } from 'next/font/google';

export const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});
```

### 2. `apps/web/src/app/layout.tsx` (or wherever font classes are applied)

Update the font variable class names from the old Plus Jakarta Sans variable to `figtree.variable`. Search for where `plusJakartaSans.variable` or similar is applied to `<html>` or `<body>` and replace with `figtree.variable`.

### 3. `packages/ui/src/globals.css`

Update the font-family fallback stack in `:root`:

```css
:root {
  --font-sans: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  --font-arabic: 'Noto Sans Arabic', 'Segoe UI', system-ui, sans-serif;
}
```

Add RTL font override:

```css
[dir='rtl'] {
  font-family: var(--font-arabic);
}
```

### 4. `packages/ui/tailwind.config.ts`

Ensure the `fontFamily` config maps to the CSS variables:

```typescript
fontFamily: {
  sans: ['var(--font-sans)'],
  mono: ['var(--font-mono)'],
},
```

## Verification

1. All pages render with Figtree (check browser DevTools → Computed → font-family).
2. Arabic pages still render with the Arabic fallback font.
3. JetBrains Mono still applies to monospace elements (IDs, codes, reference numbers).
4. Font weights 400, 500, 600, 700 all render correctly (check bold headings, medium labels, regular body text).
5. No FOUT (flash of unstyled text) — `display: 'swap'` handles this.

## What NOT to Change

- Do not change font sizes, line heights, or letter spacing yet. The type scale refinements happen naturally as components are rebuilt in later chunks.
- Do not touch any layout or navigation code.
