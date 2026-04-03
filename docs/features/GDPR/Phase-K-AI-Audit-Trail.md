# Phase K: AI Decision Audit Trail

**Master Plan Section:** 3.3
**Estimated Effort:** 2 days
**Prerequisites:** Phase B (Tokenisation Gateway — logs reference tokenisation status)
**Unlocks:** None (terminal phase)
**Wave:** 2 (starts after Phase B completes)

---

## Objective

Build an AI processing audit trail that satisfies Article 22 (right to explanation for automated decisions) and Article 35 (DPIA evidence). When a parent asks "why did you give my child this grade?", the system must be able to show: what data went to the AI (tokenised), what the AI suggested, whether a human reviewed it, and who accepted it.

---

## Prerequisites Checklist

- [ ] Phase B complete (verified in implementation log) — tokenisation gateway is live, so AI processing logs can reference whether input was tokenised and link to tokenisation usage logs

---

## Scope

### K.1 — Database Schema

```sql
CREATE TABLE ai_processing_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id),
  ai_service            VARCHAR(50) NOT NULL,
                        -- ai_comments, ai_grading, ai_grading_batch,
                        -- ai_progress_summary, ai_nl_query,
                        -- ai_report_narrator, ai_predictions,
                        -- ai_substitution, ai_attendance_scan
  subject_type          VARCHAR(20),          -- student, staff, null (for aggregate queries)
  subject_id            UUID,                 -- null for aggregate/NL queries
  model_used            VARCHAR(100),         -- e.g., claude-sonnet-4-5-20250514
  prompt_hash           VARCHAR(128),         -- SHA-256 of full prompt (storage efficient)
  prompt_summary        TEXT,                 -- truncated/redacted for human review
  response_summary      TEXT,                 -- truncated response for review
  input_data_categories TEXT[],               -- what went in: ['grades', 'attendance']
  tokenised             BOOLEAN NOT NULL,     -- was the input tokenised?
  token_usage_log_id    UUID,                 -- FK to gdpr_token_usage_log if tokenised
  output_used           BOOLEAN,              -- was the AI output accepted by the user?
  accepted_by_user_id   UUID REFERENCES users(id),
  accepted_at           TIMESTAMPTZ,
  rejected_reason       TEXT,                 -- if teacher rejected the AI output, why
  confidence_score      DECIMAL(3,2),         -- AI confidence if available
  processing_time_ms    INT,                  -- round-trip time to AI service
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_logs_tenant ON ai_processing_logs(tenant_id, created_at);
CREATE INDEX idx_ai_logs_service ON ai_processing_logs(tenant_id, ai_service);
CREATE INDEX idx_ai_logs_subject ON ai_processing_logs(tenant_id, subject_type, subject_id);

ALTER TABLE ai_processing_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_logs_tenant_isolation ON ai_processing_logs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

**Retention:** 24 months (aligns with academic appeal periods). The retention engine (Phase I, if complete) should have a policy for `ai_processing_logs`.

### K.2 — AI Service Integration

Each AI service adds logging after every AI call:

```typescript
// In every AI service, after the API call:
await this.aiAuditService.log({
  tenantId,
  aiService: 'ai_comments', // or 'ai_grading', etc.
  subjectType: 'student',
  subjectId: studentId,
  modelUsed: 'claude-sonnet-4-5-20250514',
  promptHash: this.hashPrompt(prompt),
  promptSummary: this.truncate(prompt, 500),
  responseSummary: this.truncate(response, 500),
  inputDataCategories: ['grades', 'attendance', 'behaviour'],
  tokenised: true, // from tokenisation gateway result
  tokenUsageLogId: usageLogId, // from tokenisation gateway
  processingTimeMs: elapsed,
});
```

**Output acceptance tracking:**
When a teacher accepts or rejects an AI suggestion (e.g., AI-generated grade or comment), update the log:

```typescript
await this.aiAuditService.recordDecision(logId, {
  outputUsed: true, // or false if rejected
  acceptedByUserId: teacherId,
  acceptedAt: new Date(),
  rejectedReason: null, // or 'Inaccurate assessment' if rejected
});
```

### K.3 — AiAuditService

```typescript
@Injectable()
export class AiAuditService {
  async log(entry: CreateAiLogDto): Promise<string>; // returns log ID
  async recordDecision(logId: string, decision: AiDecisionDto): Promise<void>;
  async getLogsForSubject(
    tenantId: string,
    subjectType: string,
    subjectId: string,
  ): Promise<AiProcessingLog[]>;
  async getLogsByService(
    tenantId: string,
    service: string,
    pagination: PaginationDto,
  ): Promise<PaginatedResult<AiProcessingLog>>;
  async getStats(tenantId: string, dateRange?: DateRange): Promise<AiUsageStats>;

  private hashPrompt(prompt: string): string {
    return createHash('sha256').update(prompt).digest('hex');
  }

  private truncate(text: string, maxLength: number): string {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }
}
```

### K.4 — API Endpoints

| Method | Path                                 | Permission  | Description                             |
| ------ | ------------------------------------ | ----------- | --------------------------------------- |
| GET    | `/api/v1/ai-audit/subject/:type/:id` | `gdpr.view` | Get AI processing history for a subject |
| GET    | `/api/v1/ai-audit/service/:service`  | `gdpr.view` | Get logs by AI service (paginated)      |
| GET    | `/api/v1/ai-audit/stats`             | `gdpr.view` | Aggregate AI usage statistics           |
| GET    | `/api/v1/ai-audit/:id`               | `gdpr.view` | Get single log entry with full detail   |

### K.5 — Right to Explanation View

When a parent or admin queries an AI-influenced decision, the system returns:

```json
{
  "decision": {
    "type": "ai_grading",
    "subject": "Student [name]",
    "date": "2026-03-15T10:30:00Z"
  },
  "ai_input": {
    "data_categories": ["grades", "attendance"],
    "tokenised": true,
    "note": "Student identifiers were anonymised before processing"
  },
  "ai_output": {
    "summary": "AI suggested grade: B+ (82%)",
    "model": "claude-sonnet-4-5-20250514",
    "confidence": 0.87
  },
  "human_review": {
    "reviewed": true,
    "accepted": true,
    "reviewed_by": "Ms. Murphy (Class Teacher)",
    "reviewed_at": "2026-03-15T11:00:00Z"
  }
}
```

This is the Article 22 compliance payload — it proves human oversight and data minimisation.

---

## Frontend Changes

1. **AI audit dashboard** (`/settings/compliance/ai-audit`) — overview of AI usage, acceptance rates, tokenisation rates
2. **Subject AI history** — linked from student profile, shows all AI decisions for that student
3. **Right to explanation view** — formatted for parent-facing display if needed

---

## Testing Requirements

1. **Log creation:** AI comment generation → verify `ai_processing_logs` entry created
2. **Tokenisation reference:** Log entry correctly references tokenisation usage log
3. **Prompt hashing:** Prompt hash is deterministic (same prompt → same hash)
4. **Prompt truncation:** Prompt summary is truncated to max length
5. **Decision recording:** Accept AI grade → log updated with `output_used = true`
6. **Decision recording:** Reject AI grade → log updated with `output_used = false` and reason
7. **Subject query:** Get all AI logs for a student → returns complete history
8. **Stats:** Aggregate stats return correct counts by service, acceptance rate
9. **RLS:** Tenant A cannot see Tenant B's AI logs
10. **Right to explanation:** Endpoint returns complete decision trail for a specific AI action

---

## Definition of Done

- [ ] `ai_processing_logs` table created with RLS
- [ ] `AiAuditService` implemented with all methods
- [ ] All 9+ AI services instrumented with logging
- [ ] Output acceptance/rejection tracking integrated
- [ ] API endpoints for querying AI audit trail
- [ ] Right to explanation response format
- [ ] AI audit dashboard UI
- [ ] Subject AI history view
- [ ] All existing tests pass (regression check)
- [ ] New tests written per testing requirements
- [ ] `architecture/module-blast-radius.md` updated
- [ ] Implementation log entry written in `IMPLEMENTATION-LOG.md`

---

## Implementation Log Entry

When complete, add to `Next Features/GDPR/IMPLEMENTATION-LOG.md`:

```markdown
### Phase K: AI Decision Audit Trail

- **Status:** COMPLETE
- **Completed:** [date]
- **Implemented by:** [engineer/agent]
- **Commit(s):** [hash(es)]
- **Key decisions:** [deviations — especially prompt storage approach]
- **Schema changes:** [migration name]
- **New endpoints:** [list AI audit endpoints]
- **New frontend pages:** AI audit dashboard, subject AI history
- **Tests added:** [count]
- **Architecture files updated:** module-blast-radius.md
- **Unlocks:** None (terminal phase)
- **Notes:** [any AI services that needed special handling, prompt hash approach]
```
