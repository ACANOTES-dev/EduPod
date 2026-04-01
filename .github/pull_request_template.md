## Summary

<!-- What changed and why? Keep this user-focused and scoped. -->

## Testing

- [ ] `pnpm turbo run type-check`
- [ ] `pnpm turbo run lint`
- [ ] `pnpm turbo run test`
- [ ] Targeted manual verification completed when UI or workflow behavior changed

## Safety Checklist

- [ ] No `any`, `@ts-ignore`, or unsanctioned `as unknown as X` casts introduced
- [ ] Tenant-scoped writes still use the approved RLS transaction pattern
- [ ] BullMQ producers include validated payloads with `tenant_id`
- [ ] Error handling surfaces useful context instead of swallowing failures
- [ ] Architecture docs reviewed and updated where behavior or coupling changed
- [ ] `architecture/danger-zones.md` and `architecture/module-blast-radius.md` were checked for affected areas

## Change Cost Notes

<!-- Required when touching hotspot modules or high-risk shared surfaces. -->

- Blast radius:
- Downstream consumers checked:
- Characterization or regression coverage reviewed:
- Hotspot metrics refreshed if tracked functions changed:
