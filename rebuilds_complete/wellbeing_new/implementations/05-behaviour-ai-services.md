# Implementation 05 — Behaviour AI Services

> **Wave:** 3 (parallel-safe — owns endpoints under `apps/api/src/modules/behaviour/ai/`)
> **Classification:** backend
> **Depends on:** 01, 04
> **Deploys:** API restart only

---

## Goal

Three AI capabilities exist as endpoints in code (per the audit) but are not surfaced anywhere: incident description AI parse, per-student AI summary, NL behaviour query with history. This impl audits each, ensures the underlying services are sound, gates them with the new `@RequiresAiFlag('behaviour')` decorator from impl 04, and adds a simple query-history persistence layer so the Wave 6 UI (impl 19) can render past queries.

The actual LLM provider integration is out of scope — assume it already exists (or is stubbed). This impl wires the endpoints, the gating, the storage, the audit logging, and tightens response shapes for the UI.

## Shared files this impl touches

- `apps/api/src/modules/behaviour/behaviour.module.ts` — register the AI sub-module / providers. Edit late, single final edit.
- `IMPLEMENTATION_LOG.md` — separate commit.

Hot-zone severity: **low.**

## What to build

### 1. Audit existing endpoints

`grep` the codebase for these endpoint paths from the backend report:

- `POST /behaviour/incidents/ai-parse`
- `GET /behaviour/students/:studentId/ai-summary`
- `POST /behaviour/analytics/ai-query`
- `GET /behaviour/analytics/ai-query/history`

For each: confirm the controller exists, confirm the service exists, identify the LLM provider call site. Document in your completion record what was found.

### 2. AI parse — `POST /behaviour/incidents/ai-parse`

Endpoint accepts free-text incident description, returns suggested category, severity, polarity, students mentioned, time/location hints. Wave 6 impl 19 calls this from the new-incident form's "✨ Parse with AI" button.

Apply `@RequiresAiFlag('behaviour')`. Apply `@RequiresPermission('behaviour.log')`. Validate input with Zod (`{ description: z.string().min(20).max(5000) }`). Response shape:

```ts
{
  data: {
    suggested_category_id: string | null;
    suggested_polarity: 'positive' | 'negative' | null;
    suggested_severity: 'minor' | 'moderate' | 'major' | null;
    suggested_students: Array<{ id: string; full_name: string; confidence: number }>;
    suggested_when: string | null; // ISO
    suggested_location: string | null;
    confidence_score: number; // 0–1
    raw_provider_response_id: string; // for audit
  }
}
```

If the underlying service doesn't return this shape, adapt it (do not change the LLM prompt — adapt the response). If no suggestions, return all `null` / empty arrays — the UI handles empty state.

### 3. AI student summary — `GET /behaviour/students/:studentId/ai-summary`

Query params: optional `from` / `to` date range. Response: AI-generated narrative paragraph + structured highlights (key incidents, trends, recommended interventions). Cache per student per day (24-hour TTL via Redis or in-DB cache table) to avoid re-generating on every page view.

Apply `@RequiresAiFlag('behaviour')` + `@RequiresPermission('behaviour.view')`.

Response:

```ts
{
  data: {
    student_id: string;
    summary_paragraph: string; // localised — pass user's locale to the prompt
    highlights: Array<{
      kind: 'trend' | 'incident' | 'intervention' | 'recognition';
      title: string;
      detail: string;
    }>;
    period: {
      from: string;
      to: string;
    }
    generated_at: string;
    cached: boolean;
  }
}
```

### 4. AI NL queries with history

`POST /behaviour/analytics/ai-query` accepts `{ question: string }`. Returns answer + structured data (table or chart spec) + cited incidents. Persist to `behaviour_ai_query_history` table (already exists per audit; verify, otherwise add small migration in this impl):

```prisma
model BehaviourAiQueryHistory {
  id            String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id     String   @db.Uuid
  user_id       String   @db.Uuid
  question      String   @db.Text
  answer        String   @db.Text
  data_payload  Json?
  citations     Json?
  generated_at  DateTime @default(now()) @db.Timestamptz()

  @@index([tenant_id, user_id, generated_at(sort: Desc)])
  @@map("behaviour_ai_query_history")
}
```

`GET /behaviour/analytics/ai-query/history?pageSize=20` returns paginated history scoped to the requesting user (each user sees their own query history — no cross-user visibility unless `behaviour.view_staff_analytics`).

Apply `@RequiresAiFlag('behaviour')` + `@RequiresPermission('behaviour.ai_query')`.

### 5. Audit logging

Every AI endpoint already routes through `AuditLogInterceptor` since they're mutations or sensitive reads. Verify the audit log captures: user_id, tenant_id, endpoint, input (truncated to 500 chars), provider response ID. If the interceptor isn't capturing AI calls, add explicit `this.audit.log(...)` calls in the service.

## Tests

- `behaviour-ai.service.spec.ts`:
  - Parse returns expected shape; empty suggestions handled
  - Student summary cached for 24h; second call returns cached:true without invoking LLM
  - NL query persists to history; history paginated by user_id
- `behaviour-ai.controller.spec.ts`:
  - `@RequiresAiFlag` decorator: returns 403 AI_DISABLED when flag off
  - `@RequiresPermission`: returns 403 when permission missing
  - History shows only requesting user's queries, except when caller has `behaviour.view_staff_analytics`

## Watch out for

- **LLM cost** — student summary should be cached, NL query should rate-limit per user (e.g. 30/hour). Implement rate limit via existing throttle infrastructure if available; otherwise minimal in-memory `Map<userId, { count, windowStart }>`.
- **Citation safety** — when the LLM output references incident IDs, verify the requesting user has access to each cited incident before including it in the response. Strip citations the user can't see.
- **PII in prompts** — student names and incident descriptions go to the LLM. Confirm the existing infrastructure has a redaction or consent mechanism; if not, flag in completion record + follow-up.
- **Empty-tenant graceful degradation** — for a tenant with no incidents, all three endpoints should return sensible empty responses (not 500, not 404).

## Deployment notes

- Restart: API only.
- Smoke: with AI flag OFF, parse endpoint returns 403 AI_DISABLED. Toggle flag ON via impl 04 endpoint, parse returns 200 with shape. History endpoint returns empty `data: []`.
