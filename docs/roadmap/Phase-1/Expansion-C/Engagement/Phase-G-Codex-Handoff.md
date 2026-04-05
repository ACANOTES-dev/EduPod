# Phase G Codex Handoff

Use this note to start a fresh Codex session for Phase G without re-reading the full Engagement expansion from scratch.

## Target Spec

- [Phase-G-Frontend-Trips-Conferences.md](./Phase-G-Frontend-Trips-Conferences.md)

## Current State

- Phase F frontend for forms and events is implemented and deployed.
- Engagement `.status` files are present through Phase F in `Roadmap/Phase-1/Expansion-C/Engagement/.status/`.
- The current frontend engagement foundation already exists under `apps/web/src/app/[locale]/(school)/engagement/`.
- Phase G depends on D, E, and F. Those status markers are present.

## Minimum Files To Read First

1. `Roadmap/Phase-1/Expansion-C/Engagement/Phase-G-Frontend-Trips-Conferences.md`
2. `Roadmap/Phase-1/Expansion-C/Engagement/IMPLEMENTATION-LOG.md`
3. `Plans/context.md`
4. `docs/plans/ux-redesign-final-spec.md`
5. `architecture/pre-flight-checklist.md`

Read additional architecture files only if a concrete implementation question requires them.

## Existing Frontend Surface To Reuse

- `apps/web/src/app/[locale]/(school)/engagement/layout.tsx`
- `apps/web/src/app/[locale]/(school)/engagement/_components/`
- `apps/web/src/app/[locale]/(school)/engagement/events/`
- `apps/web/src/app/[locale]/(school)/engagement/parent/`
- `apps/web/src/app/[locale]/(school)/dashboard/parent/page.tsx`
- `apps/web/messages/en.json`
- `apps/web/messages/ar.json`

## Working Assumptions

- Do not re-audit or re-implement Phase F unless integration work requires it.
- Extend the existing engagement IA and component patterns rather than creating a parallel structure.
- Keep changes scoped to Phase G deliverables: trips and conferences frontend.
- Update architecture docs only if the final code change affects documented structure or feature inventory.

## Verification + Delivery

- Run the required repo gates before push:
  - `pnpm turbo type-check`
  - `pnpm turbo lint`
  - `pnpm turbo test`
- Commit, push to `main`, and monitor both GitHub Actions workflows through completion.

## Suggested Fresh-Session Prompt

```text
Implement /Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Roadmap/Phase-1/Expansion-C/Engagement/Phase-G-Frontend-Trips-Conferences.md.

Start with /Users/ram/Library/Mobile Documents/com~apple~CloudDocs/Shared/GitHub Repos/SDB/Roadmap/Phase-1/Expansion-C/Engagement/Phase-G-Codex-Handoff.md and keep initial context loading minimal. Reuse the existing engagement frontend structure under apps/web/src/app/[locale]/(school)/engagement, avoid re-reviewing completed Phase F work unless needed for integration, then implement, verify, commit, push, and monitor deployment.
```
