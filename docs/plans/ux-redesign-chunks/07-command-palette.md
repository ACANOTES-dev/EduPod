# Chunk 07 — Command Palette Upgrade

## What This Does

Reskins the existing command palette (⌘K) to match the dark morph bar aesthetic. Adds grouped results and "Create new..." shortcuts.

## Pre-Read

- `docs/plans/ux-redesign-final-spec.md` — Section 9 (Command Palette)
- `packages/ui/src/components/command.tsx` — primitive cmdk components
- `packages/ui/src/components/command-palette.tsx` — full palette UI
- `apps/web/src/components/global-search.tsx` — current search implementation

## Files to Modify

### 1. `packages/ui/src/components/command-palette.tsx`

Restyle the command palette dialog:

- **Appearance:** Centred modal, max-width 520px
- **Background:** Dark themed — `var(--color-bar-bg)` or `#1C1917` (matches morph bar, not content area)
- **Border:** 1px `var(--color-strip-border)`
- **Border radius:** 20px (`--radius-xl`)
- **Shadow:** Large shadow for elevation
- **Input field:** Transparent bg, white text, no border, 16px font
- **Placeholder:** "Search students, invoices, staff..." in `var(--color-bar-text)`

### 2. `packages/ui/src/components/command.tsx`

Update the primitive styling:

- **CommandGroup heading:** Uppercase, 11px, `var(--color-strip-text)`, letter-spacing 0.05em
- **CommandItem:** 14px, white/light text, `var(--color-strip-text-active)` when selected
- **CommandItem hover/selected:** `var(--color-strip-active-bg)` background, 8px radius
- **CommandEmpty:** "No results found" in `var(--color-bar-text)`, centered
- **CommandSeparator:** 1px `var(--color-strip-border)`

### 3. `apps/web/src/components/global-search.tsx`

Add structure improvements:

- **"Create new..." section** at the top when input is empty:
  - "+ New Student" → `/students/new`
  - "+ New Invoice" → `/finance/invoices/new`
  - "+ New Staff" → `/staff/new`
  - Role-filtered (parents don't see staff creation)

- **Recent items section** when input is empty:
  - Show last 5 recently viewed records (from localStorage or a simple in-memory cache)

- **Grouped results** when searching:
  - Students, Households, Staff, Classes, Applications, Invoices, Payroll Runs
  - Each group with a heading and max 3 results
  - Each result: icon + primary label + secondary context (e.g., year group, student number)

- **Permission scoping:** Already handled by the search API — just ensure the UI respects empty groups.

## Verification

1. ⌘K opens the dark-themed palette centred on screen.
2. Empty state shows "Create new..." shortcuts and recent items.
3. Typing shows grouped results with proper headings.
4. Selecting a result navigates to the record page.
5. Escape closes the palette.
6. Dark mode: palette should still be dark-themed (same in both modes — it's always dark).
7. RTL: input text direction correct, results flow correctly.

## What NOT to Change

- Do not change the search API or backend search logic.
- Do not modify the keyboard shortcut handler (already works).
- Do not add new search entity types — keep existing ones.
