---
description: Enforces the redesign-era frontend shell, RTL-safe styling, and responsive component conventions
globs: ["apps/web/**"]
---

# Frontend Rules

## Source Of Truth
- `docs/plans/ux-redesign-final-spec.md` is the active frontend source of truth
- The old sidebar shell is superseded for school-facing routes unless a task explicitly says otherwise

## RTL-Safe Styling — ZERO TOLERANCE
- NEVER use physical directional classes: `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l-`, `rounded-r-`, `border-l-`, `border-r-`
- ALWAYS use logical equivalents: `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`, `rounded-s-`, `rounded-e-`, `border-s-`, `border-e-`
- This is a build error. The lint rule will catch it. Do not bypass.

## Shell & Navigation
- School-facing navigation uses the redesign's **Morphing Shell**: top morph bar plus contextual sub-strip
- Do NOT build or preserve the legacy desktop sidebar for school-facing routes
- Home uses the collapsed morph bar; module pages expand with the sub-strip
- Hub visibility must stay permission-aware, role-aware, and tenant-aware
- Search / command palette, notifications, and avatar actions belong in the morph bar
- The app shell must remain visually stable during navigation: no flicker, flash, or remount feel in the morph bar or sub-strip
- Mobile navigation follows the redesign pattern: hamburger-triggered overlay for hub navigation and a horizontally scrollable sub-strip where applicable
- Do not introduce a bottom tab bar unless the redesign spec is explicitly updated or the task specifically asks for it

## Components
- Follow the repo's current app pattern for interactive surfaces: client components with `'use client'` where needed
- shadcn/ui components from `packages/ui/` — do not install component libraries directly in `apps/web/`
- No inline styles. No CSS modules. Tailwind only.
- Theme values belong in centralized tokens / CSS variables on `<html>`, not in ad hoc component-level colour literals
- Do not hardcode colour hex values in component files
- Charts: Recharts. Rich text: TipTap with BiDi `dir` attribute per block.

## i18n
- Use `useTranslations()` in client components, `getTranslations()` in server components
- Translation files: `messages/{locale}.json`
- LTR enforcement on: email addresses, URLs, phone numbers, numeric inputs, enrolment IDs
- Western numerals (0-9) in both locales. Gregorian calendar in both locales.
- Platform admin (`(platform)/` routes) is English-only — no translation keys needed.

## Mobile Responsiveness — Mandatory
Every page and component MUST be usable at 375px width (iPhone SE). Build mobile-first.

### Layout
- Main content area in morph-shell layouts: `flex-1 min-w-0 overflow-x-hidden`. The `min-w-0` is critical — flex items default to `min-width: auto` and refuse to shrink below content width, causing horizontal overflow.
- NEVER use fixed pixel widths on content containers. Use `max-w-full`, percentages, or fluid widths.
- Use `w-full` not `100vw` — vw includes scrollbar width and causes ~15px overflow.
- Content padding: minimum `p-4` (16px) on mobile.

### Navigation & Tabs
- Morph bar: compact top row with hamburger-triggered overlay on mobile.
- Module sub-strip: horizontally scrollable on mobile with `overflow-x-auto`; use an overflow affordance or explicit "More" handling where needed.
- Tabs (≤4): inline full-width row. Tabs (5-7): horizontally scrollable with `overflow-x-auto` and fade hint. Tabs (>7): collapse to dropdown.
- Minimum touch target: 44×44px on all interactive elements.

### Forms & Inputs
- Inputs: `w-full` on mobile. Fixed-width inputs only at `md:` breakpoint and above.
- Input font-size: minimum `text-base` (16px) — prevents iOS Safari auto-zoom on focus.
- Single-column form layouts on mobile. Two-column at `md:` and above.
- Number/short inputs that need fixed width: use responsive classes (`w-full sm:w-28`).

### Tables
- Wrap every table in `<div className="overflow-x-auto">`.
- On mobile, prefer card/stacked view or horizontal scroll with sticky first column.
- Action buttons: collapse to kebab menu (three-dot) on mobile.

### Images & Media
- Always `max-w-full h-auto` on images.
- Long unbreakable strings (URLs, emails): apply `break-all` or `overflow-wrap: break-word`.

## State
- No global state libraries. No Redux. No Zustand.
- Data fetching follows repo conventions: `apiClient<T>()` with client-side effects. Do NOT introduce server-component data fetching for the authenticated app shell.
- Client state via `useState` / `useReducer`
- Auth: JWT in memory, refresh via httpOnly cookie. No `localStorage`. No `sessionStorage`.
