# Phase G — Frontend: Tusla, DES, October Returns, Anti-Bullying

**Wave**: 5
**Deploy Order**: d7
**Depends On**: F, B, C

## Scope

Builds all frontend pages and components for the Tusla compliance hub (threshold monitor, SAR/AAR generation wizards, reduced school day register), the DES September Returns UI (readiness dashboard, subject code mapping management, file generation wizard with preview and CSV download), the October Returns readiness dashboard, and the Anti-Bullying (Bí Cineálta) compliance hub. Each page consumes the API endpoints built in Phases A, B, and C.

## Deliverables

### Tusla Pages
- `apps/web/src/app/[locale]/(school)/regulatory/tusla/page.tsx` — Tusla hub with threshold monitor
- `apps/web/src/app/[locale]/(school)/regulatory/tusla/sar/page.tsx` — SAR generation wizard
- `apps/web/src/app/[locale]/(school)/regulatory/tusla/aar/page.tsx` — AAR generation wizard
- `apps/web/src/app/[locale]/(school)/regulatory/tusla/reduced-days/page.tsx` — reduced school day register

### Tusla Components
- `apps/web/src/app/[locale]/(school)/regulatory/tusla/_components/threshold-monitor-table.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/tusla/_components/sar-wizard.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/tusla/_components/aar-wizard.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/tusla/_components/reduced-day-form.tsx`

### DES Returns Pages
- `apps/web/src/app/[locale]/(school)/regulatory/des-returns/page.tsx` — DES generation dashboard (readiness + file generation)
- `apps/web/src/app/[locale]/(school)/regulatory/des-returns/subject-mappings/page.tsx` — DES subject code mapping management
- `apps/web/src/app/[locale]/(school)/regulatory/des-returns/generate/page.tsx` — file generation wizard (select file → preview → generate → download CSV)

### DES Returns Components
- `apps/web/src/app/[locale]/(school)/regulatory/des-returns/_components/readiness-checklist.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/des-returns/_components/subject-mapping-table.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/des-returns/_components/file-preview.tsx`
- `apps/web/src/app/[locale]/(school)/regulatory/des-returns/_components/file-generation-wizard.tsx`

### October Returns
- `apps/web/src/app/[locale]/(school)/regulatory/october-returns/page.tsx` — October Returns readiness dashboard
- `apps/web/src/app/[locale]/(school)/regulatory/october-returns/_components/readiness-overview.tsx` — pass/fail per validation category
- `apps/web/src/app/[locale]/(school)/regulatory/october-returns/_components/student-issues-table.tsx` — students with blocking data issues
- `apps/web/src/app/[locale]/(school)/regulatory/october-returns/_components/returns-preview.tsx` — preview data as PPOD would see it

### Anti-Bullying
- `apps/web/src/app/[locale]/(school)/regulatory/anti-bullying/page.tsx` — Bí Cineálta compliance hub
- `apps/web/src/app/[locale]/(school)/regulatory/anti-bullying/_components/bullying-incident-summary.tsx`

### i18n
- `apps/web/messages/en.json` — **add** Tusla, DES, October Returns, anti-bullying keys to `regulatory` namespace
- `apps/web/messages/ar.json` — **add** Arabic translations for same

## Out of Scope

- P-POD/POD sync pages (Phase H)
- CBA sync page (Phase H)
- Transfer management pages (Phase H)
- Backend API services (already built in Phases A, B, C)
- Worker jobs (Phase E)

## Dependencies

**Phase F** provides:
- Regulatory section routing structure and layout
- `regulatory-nav.tsx` sub-navigation component
- Sidebar navigation with all child links
- Core i18n namespace and shared component patterns

**Phase B** provides:
- Tusla API endpoints: threshold monitor, SAR/AAR generation, suspensions, expulsions, absence mappings

**Phase C** provides:
- DES API endpoints: readiness check, file generation, file preview, subject mappings
- October Returns API endpoints: readiness, preview, student issues

## Implementation Notes

- **Tusla hub**: Main page shows threshold monitor table (students approaching/exceeding 20-day threshold). Links to SAR wizard, AAR wizard, and reduced school day register.
- **SAR/AAR wizards**: Multi-step forms — select period/year → preview data → generate → download. Use `react-hook-form` with `zodResolver`.
- **Reduced day form**: Create/edit form with `react-hook-form`. Fields: student (searchable select), dates, hours, reason, approval, consent, Tusla notification status.
- **DES file generation wizard**: Select file type (A/B/C/D/E/Form TL) → preview data (table of rows that would be generated) → generate → download CSV. Show validation warnings before generation.
- **Subject mapping table**: Editable table showing tenant subjects alongside DES code dropdowns. Auto-suggest based on name matching.
- **October Returns readiness**: Category cards (PPSN, class assignment, subject allocation, address, etc.) with pass/fail indicators. Click through to student issues table filtered by category.
- **Anti-bullying**: Reads from existing behaviour module data. Shows incident counts by Bí Cineálta category. Links to behaviour module for detailed incident management.
- **RTL compliance**: All new components use logical CSS properties. No physical `left`/`right`.
- **Mobile**: All tables in `overflow-x-auto`. Forms single-column on mobile. Wizards stack steps vertically on mobile.
