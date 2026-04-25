# Reports Module Rebuild — Rollout Notes (April 2026)

## What shipped

The `reports-rebuild` (22 implementations across 5 waves; see `reports-rebuild/IMPLEMENTATION_LOG.md`) replaced the legacy mock-backed reports module with a real KPI dashboard, a curated custom report builder, three flag-gated AI features, scheduled-reports + alerts workers, finished board + compliance aggregation, and a PDF/Excel/Word export pipeline. The Wave 5 polish (impl 22) closed translation parity, mobile responsiveness, accessibility, smoke tests, and architecture docs.

## Rollout decisions

**1. AI features default to `enabled = false` per tenant.**

Three new AI flags were registered on `tenant_ai_flags` — `reports_narration`, `reports_ask_ai`, `reports_predictions`. Every tenant gets the flag rows seeded with `enabled = false`. Tenants opt in via `Settings → Reports → AI Features`. Until they do, AI surfaces hide entirely (no nag UI). The platform does not pay for AI calls — tenants do.

**2. `ANTHROPIC_API_KEY` is intentionally not configured on production at impl 22 ship.**

Every AI endpoint returns `503 AI_UNAVAILABLE` if a tenant flips a flag on without an API key configured at the environment level. The frontend renders a friendly "AI is not configured for this environment" message rather than crashing. Setting the production key is a separate operational step — see `SECRET-INVENTORY.md` for the secret name and rotation policy. **Do not set the key without updating tenant-level cost ceilings first** (see DZ-Reports-1).

**3. Snapshot lifecycle cleanup is deferred.**

The `report_share_log` table records every saved-report share with an S3 path to the rendered PDF/Excel/Word artefact. There is no lifecycle cleanup cron in the rebuild — old snapshots accumulate in the bucket. Acceptable for the test-tenant phase; before launch, add an S3 lifecycle rule (90-day TTL is the planning default) or a Bull cron that deletes share-log rows + S3 keys past TTL.

**4. KPI snapshot retention is the same.**

KPI sparklines are computed from the existing rolling-window queries (no historical snapshots stored). For longer trend lines (>13 weeks), a separate `kpi_snapshots` table would need to be introduced — out of scope for this rebuild.

**5. Board / Compliance scheduled delivery is deferred.**

Today the scheduled-reports worker only handles **saved builder reports**. Adding board / compliance to the worker is a small adaptation (route the schedule by `template_kind` and call the appropriate aggregator) — not blocking, but pending.

**6. Word export does not embed charts.**

The Word exporter renders rows + summary text only. Inline chart embeds were deferred — Recharts SVG → Word XML round-trip is fiddly and the export pipeline was already deep enough for one rebuild. Consumers who need chart-bearing Word docs should generate PDF instead.

**7. Cross-tenant report templates are out of scope.**

Each tenant's saved reports are private to that tenant. Cross-tenant template sharing is a future feature; the schema does not support it today.

## Required ops follow-ups before public launch

| Item                                                | Owner    | Where it lives                                           |
| --------------------------------------------------- | -------- | -------------------------------------------------------- |
| Configure `ANTHROPIC_API_KEY` (only when ready)     | Platform | `apps/api/.env` on production server (DO NOT overwrite!) |
| Add S3 lifecycle rule for `report_share_log` paths  | Ops      | Hetzner Object Storage console                           |
| Define per-tenant AI cost ceiling alerts            | Ops      | Sentry / observability                                   |
| Onboard real schools — flip AI flags only on demand | Ops      | `Settings → Reports → AI Features` in-app                |
| Pre-launch full smoke pack run                      | QA       | `apps/web/e2e/reports-rebuild.spec.ts` (impl 22)         |

## Production tenants for the rebuild rollout

NHQS pilot (`https://nhqs.edupod.app`) and the four stress-test tenants (`stress-a/b/c/d`) are the test surfaces. Per project memory: production tenants are test tenants until August 2026. No real end users are affected by the rebuild yet.

## Reference

- Master plan: `reports-rebuild/PLAN.md`
- Implementation log: `reports-rebuild/IMPLEMENTATION_LOG.md`
- Danger zones: `docs/architecture/danger-zones.md` § DZ-Reports-1, DZ-Reports-2, DZ-Reports-3
- Feature map: `docs/architecture/feature-map.md` § 19
- Module blast radius: `docs/architecture/module-blast-radius.md` § ReportsModule
