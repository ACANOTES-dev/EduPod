# Phase B: GDPR Tokenisation Gateway

**Master Plan Section:** 1.1
**Estimated Effort:** 5 days
**Prerequisites:** None
**Unlocks:** Phase E (Legal & Privacy Infrastructure), Phase K (AI Decision Audit Trail), Phase F (DSAR Overhaul — also requires C + D)
**Wave:** 1 (can start immediately)

---

## Objective

Build the GDPR Tokenisation Gateway — the centrepiece architectural addition. A policy-driven service that sits between EduPod and every external system, replacing personal identifiers with random tokens on outbound data and mapping them back on inbound responses. This is the single most impactful change in the entire GDPR plan.

---

## Scope

### B.1 — Database Schema (3 tables + RLS)

#### Token Mapping Table

```sql
CREATE TABLE gdpr_anonymisation_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  entity_type     VARCHAR(50) NOT NULL,  -- student, parent, staff, household
  entity_id       UUID NOT NULL,
  field_type      VARCHAR(50) NOT NULL,  -- full_name, first_name, last_name,
                                         -- student_number, staff_number,
                                         -- email, phone, national_id
  token           VARCHAR(20) NOT NULL,  -- random alphanumeric, globally unique
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_token UNIQUE (token),
  CONSTRAINT uq_entity_field UNIQUE (tenant_id, entity_type, entity_id, field_type)
);

CREATE INDEX idx_gdpr_tokens_tenant ON gdpr_anonymisation_tokens(tenant_id);
CREATE INDEX idx_gdpr_tokens_lookup ON gdpr_anonymisation_tokens(token);

ALTER TABLE gdpr_anonymisation_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY gdpr_tokens_tenant_isolation ON gdpr_anonymisation_tokens
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

#### Export Policy Table

```sql
CREATE TABLE gdpr_export_policies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  export_type     VARCHAR(100) NOT NULL UNIQUE,
  tokenisation    VARCHAR(20) NOT NULL DEFAULT 'always',
                  -- always: locked ON (AI services)
                  -- never: locked OFF (DSAR, regulatory)
                  -- configurable: toggle available, defaults to ON
  lawful_basis    VARCHAR(100) NOT NULL,
  description     TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Note:** `gdpr_export_policies` is NOT tenant-scoped — policies are platform-level. No RLS needed.

#### Token Usage Audit Log

```sql
CREATE TABLE gdpr_token_usage_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id),
  export_type     VARCHAR(100) NOT NULL,
  tokenised       BOOLEAN NOT NULL,
  policy_applied  VARCHAR(100) NOT NULL,
  lawful_basis    VARCHAR(100),
  tokens_used     UUID[],
  entity_count    INT NOT NULL DEFAULT 0,
  triggered_by    UUID NOT NULL REFERENCES users(id),
  override_by     UUID REFERENCES users(id),
  override_reason TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_gdpr_usage_tenant ON gdpr_token_usage_log(tenant_id, created_at);

ALTER TABLE gdpr_token_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY gdpr_usage_tenant_isolation ON gdpr_token_usage_log
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

### B.2 — Seed Data for Export Policies

Seed all 22 export policies as defined in the master plan:

**Always tokenise (AI services — 9 entries):**
`ai_comments`, `ai_grading`, `ai_grading_batch`, `ai_progress_summary`, `ai_nl_query`, `ai_report_narrator`, `ai_predictions`, `ai_substitution`, `ai_attendance_scan`

**Never tokenise (DSAR + regulatory — 6 entries):**
`dsar_access_export`, `dsar_portability`, `compliance_rectification`, `regulatory_tusla`, `regulatory_dept_ed`, `regulatory_revenue`

**Configurable (exports — 5 entries):**
`custom_report_export`, `board_report_export`, `student_export_pack`, `staff_export`, `parent_data_pack`

Full seed SQL is in the master plan section 1.1.

### B.3 — GdprTokenService

The core service — single chokepoint for all outbound personal data.

**Key methods:**

```typescript
@Injectable()
export class GdprTokenService {
  // OUTBOUND: tokenise personal data before it leaves EduPod
  async processOutbound(
    tenantId: string,
    exportType: string,
    data: OutboundData,
    triggeredByUserId: string,
    options?: { overrideTokenisation?: boolean; overrideReason?: string },
  ): Promise<{ processedData: OutboundData; tokenMap: TokenMap | null }>;

  // INBOUND: replace tokens with real identifiers in AI responses
  async processInbound(tenantId: string, response: string, tokenMap: TokenMap): Promise<string>;
}
```

**Policy decision logic:**

| Policy         | Behaviour                                                       | Override Allowed?  |
| -------------- | --------------------------------------------------------------- | ------------------ |
| `always`       | Tokenise, no exceptions                                         | No                 |
| `never`        | Pass through real data                                          | No                 |
| `configurable` | Default tokenise ON; admin can toggle OFF with mandatory reason | Yes (audit logged) |

**Token generation:**

- 14 characters, alphanumeric
- Character set: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no ambiguous I/O/0/1)
- Generated via `crypto.randomBytes(14)`
- Collision space: 32^14 = 1.7 x 10^21

**Token lifecycle:**

1. Created on first outbound request for entity+field
2. Reused on subsequent requests (same entity always gets same token)
3. Deleted when entity is anonymised via DSAR erasure
4. Never exported — mapping table stays inside EduPod

**What gets tokenised vs what doesn't:**

| Tokenised                             | Not Tokenised            |
| ------------------------------------- | ------------------------ |
| Student/staff full names              | Grades (85%)             |
| Student/staff numbers                 | Attendance percentages   |
| National IDs                          | Subject names            |
| First/last names                      | Academic levels          |
| Emails (not sent to AI at all)        | Non-identifying metadata |
| Phone numbers (not sent to AI at all) |                          |

### B.4 — AI Service Integration

Every existing AI service follows the same 3-line integration pattern:

```typescript
// BEFORE (current — sends student name to Anthropic):
const studentName = `${student.first_name} ${student.last_name}`;
const prompt = this.buildPrompt(studentName, grades, attendance);
const response = await this.anthropic.messages.create({ ... });
return response.content;

// AFTER (with tokenisation gateway):
const outbound = {
  entities: [{ type: 'student', id: studentId,
               fields: { full_name: `${student.first_name} ${student.last_name}` } }],
  entityCount: 1
};
const { processedData, tokenMap } = await this.gdprTokenService.processOutbound(
  tenantId, 'ai_comments', outbound, userId
);
const prompt = this.buildPrompt(processedData.entities[0].fields.full_name, grades, attendance);
const response = await this.anthropic.messages.create({ ... });
return this.gdprTokenService.processInbound(tenantId, response.content, tokenMap);
```

**All 9 AI services to integrate:**

1. AI comment generation (single)
2. AI comment generation (batch)
3. AI grading (inline)
4. AI grading (batch with instructions)
5. AI progress summaries
6. AI natural language gradebook queries
7. AI report narration
8. AI trend predictions
9. AI substitute teacher ranking
10. AI attendance scan (OCR)

Locate each AI service, identify where student/staff names are injected into prompts, and wrap with the tokenisation gateway.

### B.5 — Zod Schemas (packages/shared)

Define in `packages/shared/src/gdpr/`:

```typescript
// Export policy types
export const gdprExportPolicySchema = z.object({
  id: z.string().uuid(),
  export_type: z.string(),
  tokenisation: z.enum(['always', 'never', 'configurable']),
  lawful_basis: z.string(),
  description: z.string(),
});

// Outbound data shape
export const gdprOutboundEntitySchema = z.object({
  type: z.enum(['student', 'parent', 'staff', 'household']),
  id: z.string().uuid(),
  fields: z.record(z.string()),
});

export const gdprOutboundDataSchema = z.object({
  entities: z.array(gdprOutboundEntitySchema),
  entityCount: z.number().int().positive(),
});

// Token usage log entry
export const gdprTokenUsageLogSchema = z.object({
  export_type: z.string(),
  tokenised: z.boolean(),
  entity_count: z.number().int(),
  triggered_by: z.string().uuid(),
  override_by: z.string().uuid().nullable().optional(),
  override_reason: z.string().nullable().optional(),
});
```

### B.6 — Frontend UI Components

Three visual states for the GDPR protection badge:

**Locked ON (always tokenise — AI services):**

- Shield icon, greyed-out toggle (locked), green "GDPR Protected" label
- Tooltip: "Student identifiers are anonymised before leaving EduPod"

**Locked OFF (never tokenise — regulatory/DSAR):**

- Info icon, no toggle
- Label: "Personal Data Export"
- Tooltip: "Real data included — lawful basis: [basis from policy]"

**Configurable (toggle available):**

- Shield icon, active toggle (default ON), green label
- When admin toggles OFF: modal requires free-text reason (required field)
- Reason + who toggled is logged in the audit trail

**Where badges appear:** Any UI surface that triggers an outbound data flow (AI features, export dialogs, DSAR response screens, report generation).

### B.7 — NestJS Module Structure

```
apps/api/src/gdpr/
├── gdpr.module.ts
├── gdpr-token.service.ts
├── gdpr-token.controller.ts       # Admin endpoints for viewing token usage
├── dto/
│   ├── outbound-data.dto.ts
│   └── token-usage-query.dto.ts
├── entities/
│   ├── gdpr-anonymisation-token.entity.ts
│   ├── gdpr-export-policy.entity.ts
│   └── gdpr-token-usage-log.entity.ts
└── __tests__/
    ├── gdpr-token.service.spec.ts
    └── gdpr-token.controller.spec.ts
```

---

## API Endpoints

| Method | Path                             | Permission  | Description                                                                    |
| ------ | -------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| GET    | `/api/v1/gdpr/export-policies`   | `gdpr.view` | List all export policies                                                       |
| GET    | `/api/v1/gdpr/token-usage`       | `gdpr.view` | Query token usage audit log (paginated, filterable by export_type, date range) |
| GET    | `/api/v1/gdpr/token-usage/stats` | `gdpr.view` | Aggregate stats (tokens generated, usage by service, by month)                 |

**Note:** No CRUD for export policies — they are seeded and platform-managed. No endpoint to read the token mapping table — that would defeat the purpose.

---

## Testing Requirements

1. **Token generation:** Unit test that tokens are 14 chars, use only the valid character set, are unique
2. **Policy enforcement:**
   - `always` policy: verify data IS tokenised, override attempt is rejected
   - `never` policy: verify data passes through unchanged
   - `configurable` default: verify data IS tokenised
   - `configurable` override OFF: verify reason is required, override is audit-logged
3. **Token reuse:** Same entity+field always returns the same token across multiple calls
4. **Inbound detokenisation:** Verify tokens in AI response text are correctly replaced with real values
5. **RLS isolation:** Tenant A's tokens are invisible to Tenant B (leakage test)
6. **Audit logging:** Every processOutbound call creates a `gdpr_token_usage_log` entry
7. **AI integration:** At least 2 AI services verified end-to-end with tokenised prompts
8. **Token deletion on erasure:** When entity is anonymised, all token mappings are deleted

---

## Definition of Done

- [ ] Prisma migration created with all 3 tables + RLS policies + indexes
- [ ] Export policies seeded (22 entries)
- [ ] `GdprTokenService` implemented with processOutbound and processInbound
- [ ] All 9+ AI services integrated with the gateway
- [ ] Zod schemas defined in `packages/shared`
- [ ] Admin endpoints for viewing token usage
- [ ] Frontend GDPR badge component with 3 states
- [ ] All existing tests pass (regression check)
- [ ] New tests written per testing requirements above
- [ ] `architecture/module-blast-radius.md` updated with new `GdprModule`
- [ ] `architecture/danger-zones.md` updated (token table must never be exposed via API)
- [ ] Implementation log entry written in `IMPLEMENTATION-LOG.md`

---

## Implementation Log Entry

When complete, add to `Next Features/GDPR/IMPLEMENTATION-LOG.md`:

```markdown
### Phase B: Tokenisation Gateway

- **Status:** COMPLETE
- **Completed:** [date]
- **Implemented by:** [engineer/agent]
- **Commit(s):** [hash(es)]
- **Key decisions:** [any deviations from spec]
- **Schema changes:** [migration name]
- **New endpoints:** GET /api/v1/gdpr/export-policies, GET /api/v1/gdpr/token-usage, GET /api/v1/gdpr/token-usage/stats
- **New frontend pages:** None (component only — GDPR badge)
- **Tests added:** [count]
- **Architecture files updated:** module-blast-radius.md, danger-zones.md, event-job-catalog.md
- **Unlocks:** Phase E (Legal Infrastructure), Phase K (AI Audit Trail), and contributes to Phase F (DSAR — also needs C + D)
- **Notes:** [token format details, any AI services that needed special handling]
```
