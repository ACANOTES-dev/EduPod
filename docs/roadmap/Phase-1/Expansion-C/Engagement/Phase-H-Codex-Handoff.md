# Phase H Codex Handoff

Use this note to start a fresh Codex session for Phase H without reloading the full Engagement expansion.

## Target Spec

- [Phase-H-Hardening.md](./Phase-H-Hardening.md)

## Current State

- Phases A through F have `.built` and `.complete` status markers in `Roadmap/Phase-1/Expansion-C/Engagement/.status/`.
- Phase G frontend trips and conferences work has been implemented locally in commit `728233e` (`feat(engagement): add trips and conferences frontend flows`).
- `Roadmap/Phase-1/Expansion-C/Engagement/.status/Phase-G.built` has been backfilled from the completed local implementation.
- `Roadmap/Phase-1/Expansion-C/Engagement/.status/Phase-G.complete` has not been written yet in this repo state, because deployment confirmation has not been recorded.
- If you run `/agentx` for Phase H, the dependency gate should wait for `Phase-G.complete` to exist before proceeding.

## Minimum Files To Read First

1. `Roadmap/Phase-1/Expansion-C/Engagement/Phase-H-Hardening.md`
2. `Roadmap/Phase-1/Expansion-C/Engagement/IMPLEMENTATION-LOG.md`
3. `Roadmap/Phase-1/Expansion-C/Engagement/Phase-G-Codex-Handoff.md`
4. `Plans/context.md`
5. `architecture/pre-flight-checklist.md`

Read additional architecture files only if a concrete implementation question requires them.

## What Phase G Already Added

- Staff trip workflows:
  - `apps/web/src/app/[locale]/(school)/engagement/events/[id]/trip-pack/page.tsx`
  - `apps/web/src/app/[locale]/(school)/engagement/events/[id]/attendance/page.tsx`
  - `apps/web/src/app/[locale]/(school)/engagement/events/[id]/risk-assessment/page.tsx`
  - `apps/web/src/app/[locale]/(school)/engagement/events/[id]/incidents/page.tsx`
- Conference workflows:
  - `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/setup/page.tsx`
  - `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/schedule/page.tsx`
  - `apps/web/src/app/[locale]/(school)/engagement/conferences/[id]/my-schedule/page.tsx`
  - `apps/web/src/app/[locale]/(school)/engagement/parent/conferences/[id]/book/page.tsx`
  - `apps/web/src/app/[locale]/(school)/engagement/parent/conferences/[id]/my-bookings/page.tsx`
- Shared engagement support:
  - `apps/web/src/app/[locale]/(school)/engagement/_components/attendance-toggle.tsx`
  - `apps/web/src/app/[locale]/(school)/engagement/_components/schedule-grid.tsx`
  - `apps/web/src/app/[locale]/(school)/engagement/_components/slot-picker.tsx`
  - `apps/web/src/app/[locale]/(school)/engagement/_components/engagement-types.ts`
- Backend support added for the frontend:
  - `apps/api/src/modules/engagement/events.controller.ts`
  - `apps/api/src/modules/engagement/trip-pack.service.ts`
  - `apps/api/src/modules/engagement/conferences.service.ts`
- Architecture/i18n already extended:
  - `apps/web/messages/en.json`
  - `apps/web/messages/ar.json`
  - `architecture/feature-map.md`

## Phase H Focus

- Add engagement analytics API and frontend dashboard.
- Integrate engagement events into the school calendar surface instead of building a parallel calendar.
- Implement annual consent renewal worker + cron registration.
- Verify or improve performance targets for engagement endpoints.
- Keep scope tight to the deliverables in `Phase-H-Hardening.md`; do not re-open Phases B through G unless Phase H integration requires it.

## Verification Expectations

- Run the required repo gates before push:
  - `pnpm turbo type-check`
  - `pnpm turbo lint`
  - `pnpm turbo test`
- If Phase H changes analytics-heavy queries or calendar loading behavior, include targeted verification for performance-sensitive paths.
- Only write `Phase-H.complete` after the deploy/push path is actually finished and verified.

## Suggested Fresh-Session Prompt

```text
Implement /Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Roadmap/Phase-1/Expansion-C/Engagement/Phase-H-Hardening.md.

Start with /Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Roadmap/Phase-1/Expansion-C/Engagement/Phase-H-Codex-Handoff.md. Treat Phase G as implemented locally in commit 728233e, but note that /Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Roadmap/Phase-1/Expansion-C/Engagement/.status/Phase-G.complete is not present yet, so follow the dependency gate rules if using /agentx. Reuse the existing engagement/frontend/calendar structure, implement only Phase H deliverables, then verify thoroughly.
```
