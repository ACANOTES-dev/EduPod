# Implementation 10 — AI Flag Registration + AI Narration Service

> **Wave:** 3 (parallel, API restart)
> **Depends on:** 01, 03
> **Deploys:** API restart only

---

## Goal

Wire the three reports AI module flags (`reports_narration`, `reports_ask_ai`, `reports_predictions`) into the existing `tenant_ai_flags` infrastructure, and rebuild `AiReportNarratorService` as a polished flagship feature — AI-written executive summaries on the dashboard, contextual paragraphs on every report, and summaries on saved reports. All cached, all audited, all permission-gated, all off by default.

## What to change

### 1. AI flag registration

Extend the shared AI flag schema. In `packages/shared/src/reports/ai-flags.ts` (created in impl 01):

```ts
export const reportsAiModuleKeySchema = z.enum([
  'reports_narration',
  'reports_ask_ai',
  'reports_predictions',
]);
export type ReportsAiModuleKey = z.infer<typeof reportsAiModuleKeySchema>;
```

In `apps/api/src/modules/ai-flags/ai-flags.service.ts` (existing wellbeing-owned service):

- Extend the allowed module-key enum to accept both `wellbeingAiModuleKeySchema` and `reportsAiModuleKeySchema` values. Use a union schema.
- Extend the permission gate: reading/writing reports flags requires `reports.settings`.

In `apps/api/src/modules/ai-flags/ai-flags.controller.ts`:

- Existing endpoints work against any module_key — no new endpoints needed. Just extend the Zod validation union.

### 2. Enforcement guard

New guard `AiFlagGuard` (if not already present — check existing `ai-flags` module). If present, reuse; if absent, create:

```ts
@Injectable()
export class AiFlagGuard implements CanActivate {
  constructor(private readonly aiFlagsService: AiFlagsService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleKey = this.reflector.get<string>('aiModuleKey', context.getHandler());
    const { tenant_id } = this.getTenantContext(context);
    const flag = await this.aiFlagsService.getFlagEnabled(tenant_id, moduleKey);
    if (!flag)
      throw new ForbiddenException({
        code: 'AI_DISABLED',
        message: `AI feature "${moduleKey}" is not enabled for this tenant.`,
      });
    return true;
  }
}

export const RequiresAiFlag = (moduleKey: string) => SetMetadata('aiModuleKey', moduleKey);
```

All AI endpoints in impls 10, 11, 12 decorate with `@UseGuards(AiFlagGuard)` + `@RequiresAiFlag('reports_narration' | ...)`.

### 3. `AiReportNarratorService` polish

Current state: the service exists (`apps/api/src/modules/reports/ai-report-narrator.service.ts`) and throws 503 if `settings.ai.reportNarrationEnabled` is false. Replace that check with the new `AiFlagGuard` at the controller level.

Service rewrite scope:

- **`narrateDashboard(tenantId, userId): Promise<{ narrative: string; generated_at: string; cache_hit: boolean }>`** — input: the full `KpiDashboardResponse` from impl 03; output: a 3-sentence "what changed this week" paragraph.
- **`narrateReport(tenantId, userId, reportKey, data): Promise<{ narrative; ... }>`** — for individual domain reports (attendance, grades, demographics, etc.). Input: the report's data envelope. Output: 1-paragraph contextual explanation.
- **`narrateSavedReport(tenantId, userId, savedReportId): Promise<{ narrative; ... }>`** — for custom builder reports. Executes the query via the query engine, summarises the result set.

### 4. Prompt construction

Prompts are templated per narration type. Keep them short and concrete:

```
You are an educational analytics assistant. Summarise the following school
dashboard in 3 sentences, highlighting what changed this week compared to
last week. Be specific (use numbers). Do not invent information. Do not
include greetings or closing phrases. Audience: school principal.

Data:
{data_json}
```

Prompts live in `apps/api/src/modules/reports/ai-narration/prompts/`. One file per narration type. Each file exports a `build(data): string` function.

### 5. Caching

Every narration call caches for 10 minutes, keyed:

```
ai_narration:${tenant_id}:${feature}:${sha256(data_json + prompt_version)}
```

Cache stored in Redis. On cache hit, set `cache_hit: true` in response.

`prompt_version` is a monotonic integer in each prompt file. Bump when you change a prompt so old caches invalidate.

### 6. Audit logging

Every AI call — cache hit or miss — writes a row to `ai_logs` (existing table). On cache miss, also write the full prompt + response. On cache hit, write only the cached-from-key reference. This keeps audit complete while avoiding blob duplication.

### 7. Cost tracking

Add a `cost_usd_estimate` column to `ai_logs` if not already present (verify; add via this phase's migration if needed). For each call, estimate cost from the response's token counts (Anthropic SDK returns these). Accumulated cost per tenant per month is queryable via a simple `sum()` — no UI in this phase, but the data is there.

### 8. Endpoints

Existing narration endpoints to update:

- `POST /v1/reports/analytics/ai-summary` → `narrateDashboard`. Guarded `@UseGuards(AiFlagGuard) @RequiresAiFlag('reports_narration')`.
- `POST /v1/reports/ai-narrator/report/:reportKey` → `narrateReport`.
- `POST /v1/reports/ai-narrator/saved/:savedReportId` → `narrateSavedReport`.

Each returns `{ data: { narrative, generated_at, cache_hit, cost_usd_estimate } }`.

### 9. Fallback copy

If the Anthropic call fails (network, rate limit, API down), return an honest error message with a specific code:

```
{ code: 'AI_UNAVAILABLE', message: 'AI narration is temporarily unavailable. Please try again in a moment.' }
```

Do NOT return a canned fake narrative. The user should see the error clearly.

## Testing requirements

- **Unit test** — narration builder produces expected prompt structure given sample data.
- **Unit test** — cache key stability (same input → same key; different prompt version → different key).
- **Unit test with mocked Anthropic client** — happy path returns narrative + logs to `ai_logs`.
- **Unit test** — flag disabled → guard throws `AI_DISABLED`.
- **Integration test** — end-to-end call against a mocked Anthropic SDK, verify cache hit behaviour.

## Post-deploy verification

1. Before enabling the flag for NHQS: `POST /v1/reports/analytics/ai-summary` — expect 403 `AI_DISABLED`.
2. Enable the flag: `PUT /v1/tenant/ai-flags/reports_narration { enabled: true }` as owner.
3. Re-call the endpoint — expect a narrative string with `cache_hit: false`.
4. Call again within 10 minutes — expect `cache_hit: true`, same narrative.
5. Check `ai_logs` — two rows, one with full prompt/response, one with cache-hit reference.
6. Disable the flag — subsequent calls return 403 again.

## Follow-ups for subsequent waves

- **Impl 11 (Ask-AI)** and **Impl 12 (Predictions)** reuse the guard, cache key scheme, and `ai_logs` wiring.
- **Impl 18 (AI Panel UI)** consumes all three narration endpoints.
- **Impl 21 (Settings page)** exposes the three AI flag toggles.

## Rollback

`git revert <sha>` — service rewrite only. The flag infrastructure stays (the three module keys are just rows in `tenant_ai_flags`; harmless). Safe.

## Architecture doc update

Update `docs/architecture/module-blast-radius.md`: reports module now depends on the `ai-flags` module.
