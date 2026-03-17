---
description: Enforces RTL-safe styling, i18n patterns, and component conventions in the frontend
globs: ["apps/web/**"]
---

# Frontend Rules

## RTL-Safe Styling — ZERO TOLERANCE
- NEVER use physical directional classes: `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l-`, `rounded-r-`, `border-l-`, `border-r-`
- ALWAYS use logical equivalents: `ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`, `rounded-s-`, `rounded-e-`, `border-s-`, `border-e-`
- This is a build error. The lint rule will catch it. Do not bypass.

## Components
- Server components by default. Only add `'use client'` when interactivity is required.
- shadcn/ui components from `packages/ui/` — do not install component libraries directly in `apps/web/`
- No inline styles. No CSS modules. Tailwind only.
- Charts: Recharts. Rich text: TipTap with BiDi `dir` attribute per block.

## i18n
- Use `useTranslations()` in client components, `getTranslations()` in server components
- Translation files: `messages/{locale}.json`
- LTR enforcement on: email addresses, URLs, phone numbers, numeric inputs, enrolment IDs
- Western numerals (0-9) in both locales. Gregorian calendar in both locales.
- Platform admin (`(platform)/` routes) is English-only — no translation keys needed.

## State
- No global state libraries. No Redux. No Zustand.
- Server state via React Server Components + revalidation
- Client state via `useState` / `useReducer`
- Auth: JWT in memory, refresh via httpOnly cookie. No `localStorage`. No `sessionStorage`.
