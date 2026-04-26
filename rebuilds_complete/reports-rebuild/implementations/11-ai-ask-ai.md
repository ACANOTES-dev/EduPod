# Implementation 11 — AI Ask-AI Service

> **Wave:** 3 (parallel, API restart)
> **Depends on:** 01, 02
> **Deploys:** API restart only

---

## Goal

Build the natural-language → custom-report translation service. A user types "Year 10 students with attendance below 85% and no recent behaviour incidents" and the service produces a valid `SavedReportQuery` (the same type the builder saves) that the query engine can execute safely. The builder UI renders the translated query as if the user built it by hand; the user can tweak and save.

This is the single most impactful AI feature in the product. It must feel like magic and fail gracefully.

## What to change

### 1. New module: `ai-ask-ai/`

File layout under `apps/api/src/modules/reports/ai-ask-ai/`:

```
ai-ask-ai/
├── ai-ask-ai.service.ts
├── ai-ask-ai.controller.ts
├── ai-ask-ai.service.spec.ts
├── prompts/
│   ├── system-prompt.ts                    # the "here's your schema" master prompt
│   ├── examples.ts                          # few-shot examples
│   └── build-prompt.ts
└── translators/
    └── query-validator.ts                   # Zod validation of AI output
```

### 2. Service interface

```ts
class AiAskAiService {
  async translate(
    tenantId: string,
    userId: string,
    permissions: string[],
    naturalLanguageQuery: string,
  ): Promise<{
    query: SavedReportQuery;
    rationale: string; // AI's 1-2 sentence explanation
    confidence: 'high' | 'medium' | 'low';
    warnings: string[]; // e.g. "I assumed 'recent' means 30 days"
    cache_hit: boolean;
  }>;
}
```

### 3. The prompt

The system prompt includes the full permission-scoped subject registry (from impl 02) as the AI's grammar. Structure:

```
You are an assistant that translates natural-language queries about school data
into structured JSON queries. You MUST ONLY produce queries using the schema
below. Do NOT invent fields, subjects, or operators. If the user asks for
something outside the schema, respond with an empty query and a warning.

Schema:
{permission_scoped_subject_registry_as_json}

Output format (strict JSON, no prose):
{
  "subject": "...",
  "columns": [{ "field_id": "..." }],
  "filters": { "operator": "AND", "children": [{ "field_id": "...", "op": "...", "value": ... }] },
  "group_by": [],
  "rationale": "I chose ... because ...",
  "confidence": "high" | "medium" | "low",
  "warnings": ["I assumed 'recent' means the last 30 days"]
}

Examples:
{few_shot_examples}
```

Few-shot examples: 8-10 realistic queries with their expected JSON outputs. Include:

- "List all students" → simple subject + columns.
- "How many students in Year 10?" → group-by + count aggregation.
- "Students with overdue fees" → filter on finance_summary.
- "Teachers who haven't submitted grades this week" → subject=Staff, complex join.
- "Students with attendance below 85%" → numeric filter.

### 4. Strict output validation

The AI's raw response goes through `queryValidator.validate(rawJson)`:

1. Parse JSON; on parse failure → return warning "AI output was malformed, try rephrasing".
2. Zod-validate against `savedReportQuerySchema`.
3. Walk every `field_id` and verify it exists in the permission-scoped subject registry for this user.
4. Walk every filter leaf; verify operator is allowed on the field's type.
5. On any failure, log the offending AI output to `ai_logs`, return `{ query: null, warnings: ['...'], confidence: 'low' }`.

This is the single load-bearing safety check — the AI never directly executes anything. Its output is a proposal, validated before use.

### 5. No direct execution

**`AiAskAiService.translate()` does NOT execute the query.** It only returns the translated `SavedReportQuery`. The caller (usually the frontend) decides whether to run `POST /v1/reports/builder/preview` with the translated query. This clean separation means a bad AI output can't corrupt or leak data — it's just a proposal.

### 6. Endpoint

`POST /v1/reports/ai-ask-ai`:

```
body: { query_text: string }
returns: {
  data: {
    query: SavedReportQuery | null,
    rationale: string,
    confidence: 'high' | 'medium' | 'low',
    warnings: string[],
    cache_hit: boolean,
  }
}
```

Guarded `@UseGuards(AiFlagGuard) @RequiresAiFlag('reports_ask_ai')` + `@RequiresPermission('reports.ai.ask_ai')`.

### 7. Caching

Key: `ai_ask_ai:${tenant_id}:${user_id}:${sha256(query_text + permissions_hash + prompt_version)}`. Cache 24 hours (ask-AI queries tend to be stable per user — "show me overdue invoices" returns the same JSON every time until the user changes phrasing).

### 8. Audit

Every translation attempt logs to `ai_logs`, including input text + output JSON + validation result. Failed validations are also logged so we can improve the prompt over time.

### 9. Query history

New table `ai_ask_ai_history` (declare in impl 01 if not already — verify; if missing, add in this phase's migration):

```prisma
model AiAskAiHistory {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenant_id   String   @db.Uuid
  user_id     String   @db.Uuid
  query_text  String   @db.Text
  result_json Json     @db.JsonB
  was_saved   Boolean  @default(false)
  created_at  DateTime @default(now()) @db.Timestamptz()

  @@index([tenant_id, user_id, created_at(sort: Desc)])
  @@map("ai_ask_ai_history")
}
```

`was_saved` flips true when the user takes the translated query and saves it as a named report. Useful for measuring Ask-AI utility.

`GET /v1/reports/ai-ask-ai/history` returns the calling user's last 20 queries.

### 10. Rate limiting

Per user: max 20 Ask-AI calls per hour. Simple in-memory or Redis-backed limiter. Returns 429 `{ code: 'AI_RATE_LIMITED', message: '...' }` when exceeded.

### 11. Suggested queries

The existing `askAiSuggestion1..5` translation keys are the starter suggestions. Keep them. Add new keys in impl 22's translation sweep for 5 more suggestions tailored to the 11 subjects.

## Testing requirements

- **Unit test** — build-prompt produces expected structure.
- **Unit test** — validator catches: malformed JSON, missing field id, invalid operator, permission-scoped field excluded.
- **Unit test** — happy path against a mocked Anthropic client returns a clean SavedReportQuery.
- **Unit test** — flag off → 403.
- **Integration test** — end-to-end with a mock AI that returns a valid translation for "list Year 10 students with attendance below 85%".
- **Rate limit test** — 21 calls in an hour, 21st is 429.

## Post-deploy verification

1. Enable `reports_ask_ai` flag for NHQS.
2. `POST /v1/reports/ai-ask-ai { query_text: "how many students are in Year 10" }` — expect a valid `SavedReportQuery` with `subject: 'student'`, a filter on year group, and a count aggregation.
3. `POST /v1/reports/builder/preview` with the returned query — expect a real row count.
4. Check `ai_logs` for the call, `ai_ask_ai_history` for the history row.
5. Bad query test: `POST { query_text: "show me the secret admin password" }` — expect a 200 with `query: null`, warnings populated, confidence: low.

## Follow-ups for subsequent waves

- **Impl 16 (Builder UI)** consumes this endpoint. The "Ask AI" input sits above the subject picker; on submit, the builder populates from the translated query.
- **Impl 18 (AI Panel UI)** surfaces the Ask-AI history for the user.

## Rollback

`git revert <sha>` — removes the module. Safe.

## Architecture doc update

`docs/architecture/module-blast-radius.md`: reports now depends on ai-flags and the AnthropicClientService.
