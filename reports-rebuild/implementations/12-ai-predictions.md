# Implementation 12 — AI Predictions Service

> **Wave:** 3 (parallel, API restart)
> **Depends on:** 01
> **Deploys:** API restart only

---

## Goal

Build the predictions surface: three concrete AI-powered predictions — student risk, attendance forecast, cash-flow forecast — each cached, flag-gated, and exposed via a typed endpoint the UI consumes. The existing `AiPredictionsService` has scaffolding; this phase fills in the prompts, caching, audit, and permission gates to make it flagship-quality.

## What to change

### 1. Service rewrite (`apps/api/src/modules/reports/ai-predictions.service.ts`)

Three public methods:

```ts
class AiPredictionsService {
  async predictStudentRisk(
    tenantId: string,
    userId: string,
    studentId: string,
  ): Promise<{
    risk_score: number; // 0-100
    narrative: string; // 2-sentence plain-English explanation
    factors: Array<{ label: string; weight: 'high' | 'medium' | 'low' }>;
    confidence: 'high' | 'medium' | 'low';
    generated_at: string;
    cache_hit: boolean;
  }>;

  async forecastAttendance(
    tenantId: string,
    userId: string,
    yearGroupId: string,
    weeksAhead: number,
  ): Promise<{
    forecast: Array<{
      week_start: string;
      predicted_rate: number;
      confidence_interval: [number, number];
    }>;
    narrative: string;
    generated_at: string;
    cache_hit: boolean;
  }>;

  async forecastCashFlow(
    tenantId: string,
    userId: string,
    daysAhead: number,
  ): Promise<{
    forecast: Array<{
      date: string;
      expected_receipts: number;
      confidence_interval: [number, number];
    }>;
    narrative: string;
    generated_at: string;
    cache_hit: boolean;
  }>;
}
```

### 2. Input data gathering

Each prediction gathers structured history then sends to Claude.

- **Student risk** — last 90 days of attendance records, last 30 days of behaviour incidents, last 4 assessment grades, SEN profile flag, safeguarding open flag. Bundle as compact JSON.
- **Attendance forecast** — last 12 weeks of weekly attendance rate per year group.
- **Cash-flow forecast** — last 90 days of invoices issued + payments received, due-in-next-30-days invoices (expected receipts).

Each gathering function is a small method on the service. They use existing domain services where available (`StudentProgressService.getStudentProgress`, `AttendanceAnalyticsService.getTrends`, etc.).

### 3. Prompts

Prompts live in `apps/api/src/modules/reports/ai-predictions/prompts/`:

- `student-risk.prompt.ts`
- `attendance-forecast.prompt.ts`
- `cash-flow.prompt.ts`

Each prompt is short, specific, and requests structured JSON output:

```
You are an educational analytics assistant predicting student risk. Given the
student's attendance, behaviour, grades, and flags, produce a risk score from
0 to 100 (higher = more at risk) and a 2-sentence plain-English explanation of
the top contributing factors. Do not invent information.

Data:
{data_json}

Output (strict JSON):
{ "risk_score": number, "narrative": string, "factors": [{ "label": string, "weight": "high" | "medium" | "low" }], "confidence": "high" | "medium" | "low" }
```

Each prompt file exports a `build(data): string` and a `prompt_version: number`.

### 4. Output validation

Every AI response is Zod-validated before returning. On validation failure, log to `ai_logs` + return `AI_PREDICTION_UNPARSEABLE` error; do not synthesise a fake prediction.

### 5. Caching

Cache keys:

- Student risk: `ai_pred_student_risk:${tenant_id}:${student_id}` TTL 24h.
- Attendance forecast: `ai_pred_attendance:${tenant_id}:${year_group_id}:${weeks_ahead}` TTL 24h.
- Cash flow: `ai_pred_cashflow:${tenant_id}:${days_ahead}` TTL 24h.

Admins can force-refresh via `?refresh=true` query param on each endpoint (costs a fresh call). Regular callers respect cache.

### 6. Endpoints

```
GET  /v1/reports/predictions/student-risk/:studentId
GET  /v1/reports/predictions/attendance-forecast/:yearGroupId?weeks=2
GET  /v1/reports/predictions/cash-flow-forecast?days=30
```

Each guarded: `@UseGuards(AiFlagGuard) @RequiresAiFlag('reports_predictions') @RequiresPermission('reports.ai.predictions')`. Student risk also requires the underlying `students.view` for that student (tenant scope already enforced by RLS).

### 7. Audit

Every call logs to `ai_logs` including input data hash + output JSON + cache-hit status. Cost estimate populated from Anthropic token counts.

### 8. Bulk student risk

Helper endpoint for the "at-risk students" KPI drill-down: `GET /v1/reports/predictions/student-risk/bulk?year_group_id=X` returns risk scores for all students in a year group (paginated). This is the only bulk endpoint; it respects the same cache per-student. Internally it's N sequential cache-aware calls; no batch prompt.

### 9. Guardrail: do not surface fake predictions

If the Anthropic call fails, the endpoint returns 503 `AI_UNAVAILABLE`. No fallback, no fake prediction. This is critical for trust: a principal who acts on an AI risk score and later discovers it was fabricated loses confidence in the product permanently.

## Testing requirements

- **Unit test per prediction** — happy path with mocked AI client.
- **Unit test** — validation rejects malformed output.
- **Unit test** — cache hit on second call.
- **Unit test** — flag off → 403.
- **Integration test** — end-to-end student risk with seeded data.
- **Permissions test** — user without `reports.ai.predictions` → 403.

## Post-deploy verification

1. Enable `reports_predictions` flag for NHQS.
2. `GET /v1/reports/predictions/student-risk/:studentId` — expect a 0-100 score, 2-sentence narrative, factors listed.
3. Call again — `cache_hit: true`.
4. Call with `?refresh=true` — `cache_hit: false`, new generated_at.
5. `GET /v1/reports/predictions/attendance-forecast/:yearGroupId?weeks=4` — expect 4 weeks of forecast with confidence intervals.
6. Check `ai_logs` has entries with cost estimates.

## Follow-ups for subsequent waves

- **Impl 18 (AI Panel UI)** renders prediction panels on the relevant report pages.
- **Impl 14 (KPI Dashboard UI)** — the "At-risk students" KPI drill-down opens the bulk student-risk view.
- Future: expose predictions in the board report as an optional section.

## Rollback

`git revert <sha>` — service changes only. Safe.

## Architecture doc update

`docs/architecture/event-job-catalog.md` — note the new AI endpoints and their caching behaviour.
