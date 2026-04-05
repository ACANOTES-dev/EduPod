# UX Redesign — Implementation Chunks

**Source spec:** `docs/plans/ux-redesign-final-spec.md`
**Vision doc:** `docs/roadmap/Phase-2/ux-redesign-vision.md`

## Chunk Sequence

Chunks must be executed in order. Each chunk builds on the previous.

| Chunk | Name                    | Dependencies | Estimated Scope                            |
| ----- | ----------------------- | ------------ | ------------------------------------------ |
| 01    | Design Token System     | None         | 2 files modified                           |
| 02    | Font Swap               | 01           | 3 files modified                           |
| 03    | Morph Bar               | 01, 02       | 4 new components, 1 layout rewrite         |
| 04    | Sub-Strip               | 03           | 2 new components, nav-config rewrite       |
| 05    | Module Page Migration   | 03, 04       | Every `(school)/` page layout touched      |
| 06    | Home Page               | 03, 04       | 6-8 new components, dashboard page rewrite |
| 07    | Command Palette Upgrade | 01           | 2 files modified                           |
| 08    | Mobile Responsive       | 03, 04       | Morph bar + sub-strip mobile variants      |
| 09    | Role-Specific Home      | 06           | 4 role variant components                  |
| 10    | Polish Pass             | All          | Transitions, skeletons, empty states       |

## Key Files (read before ANY chunk)

These files define the codebase conventions. Every chunk must follow them:

- `CLAUDE.md` — coding rules (RTL, imports, forms, components)
- `docs/plans/ux-redesign-final-spec.md` — the design spec (source of truth)
- `packages/ui/src/globals.css` — current CSS variables (chunk 01 replaces these)
- `packages/ui/tailwind.config.ts` — Tailwind theme config
- `apps/web/src/lib/nav-config.ts` — current navigation structure
- `apps/web/src/app/[locale]/(school)/layout.tsx` — current school shell

## Rules for All Chunks

1. **No hardcoded colour hex values in components.** All colours via CSS variables.
2. **Logical CSS properties only.** `ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`. Never `ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`.
3. **No new dependencies** unless explicitly stated in the chunk.
4. **Preserve all existing functionality.** This is a visual redesign, not a feature change.
5. **`@school/ui` is the component library.** New shared components go there. Page-specific components go in the page's `_components/` directory.
6. **Test in both LTR (English) and RTL (Arabic)** after each chunk.
7. **Test in both light and dark mode** after each chunk.
