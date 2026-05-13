# Implementation 20 — Trips Placeholder + Analytics Ghost-Key Cleanup

> **Phase:** 4 — Wave W4
> **Wave:** W4
> **Depends on:** W1 02 (migration removed analytics ghost rows; this spec verifies + finalizes)
> **Deploys:** No prod deploy; cleanup + docs only
> **Model:** Sonnet 4.6

---

## Goal

Two cleanup tasks:

1. **Trips**: confirm the trips module remains a stub (no controllers, no real domain) and document this status. Trips is NOT in the gateable registry; do not surface it in the admin console.
2. **Analytics ghost key**: confirm impl 02's migration removed all `tenantModule` rows with `module_key = 'analytics'`; verify no code references the deprecated key; remove any stale documentation.

---

## Critical safety constraints

- **No new code; only verification + docs.**
- **The `analytics` key MUST NOT reappear anywhere.** If a future contributor adds it back, the registry's `ModuleKey` union will reject it (TS error). This spec verifies that's still true.
- **Trips stub stays stubbed.** If trips ever becomes a real module, that's a separate spec that adds it to the registry and follows the per-module W3-style enforcement pattern.

---

## Files to verify / modify

### Verification (no edits unless violations found)

- `grep -rn "'analytics'" apps/api/src/ apps/worker/src/ apps/web/src/ packages/` — must return zero hits. If any, those references are stale and should be deleted.
- `grep -rn "module_key.*analytics" packages/prisma/` — must return zero hits in non-archived files (the deprecated key shouldn't appear in any active seed or migration).
- `psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM tenant_modules WHERE module_key = 'analytics';"` — production assertion, must return 0.
- `ls apps/api/src/modules/trips/` — confirm only the `*.module.ts` and audience provider files; no controllers, no services beyond `TripRosterProvider`.

### Documentation

- `docs/architecture/feature-map.md` — verify trips is documented as "stub: provides inbox audience provider only; not gateable". If not documented, add a one-liner under the Operations or "stubs" section.
- `Module Gating/STRATEGY.md` — already mentions trips deferral in §3 + §5.2. No change needed unless a new decision was made.

---

## Acceptance

- [ ] Zero hits for `'analytics'` literal across the codebase (excluding `_archive/` and historical commit messages).
- [ ] Zero rows in production with `module_key = 'analytics'` (verified via psql).
- [ ] Trips module confirmed stub: only `*.module.ts` + `trip-roster.provider.ts` (or equivalent audience-provider file). No controllers, no service business logic, no permissions.
- [ ] Trips documented as a stub in feature-map.md.
- [ ] STRATEGY.md trips/analytics decisions remain consistent (no edits needed if everything aligns).

---

## Notes

- This is bookkeeping. ~30 minutes of work.
- If trips becomes a real module in the next 6–12 months, the new spec adds it to the registry following the W3 template. Default OFF probably — schools that haven't asked for trips don't get the UI.
- If a future grep finds `'analytics'` somewhere unexpected, that's a real bug — investigate before deleting; could be intentional code referencing an unrelated `analytics` (e.g., Google Analytics).
