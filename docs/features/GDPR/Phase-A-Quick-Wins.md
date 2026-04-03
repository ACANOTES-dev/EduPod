# Phase A: Quick Wins — Privacy-First Defaults + Cron Job Registration

**Master Plan Sections:** 1.3, 1.8
**Estimated Effort:** 1 day
**Prerequisites:** None
**Unlocks:** Phase D (Consent Records)
**Wave:** 1 (can start immediately)

---

## Objective

Establish GDPR-compliant baseline defaults and activate two existing-but-unregistered cleanup processors. These are the smallest, highest-value changes in the entire plan — zero architectural risk, immediate compliance improvement.

---

## Scope

### A.1 — Privacy-First Tenant Defaults (Master Plan 1.8)

**Problem:** AI features default to ON. GDPR Article 25(2) requires data protection by default — the most privacy-friendly settings must be the default, with schools explicitly opting in.

**Changes to `tenantSettingsSchema` in `packages/shared`:**

| Setting Path                                | Current Default | New Default |
| ------------------------------------------- | --------------- | ----------- |
| `behaviour.ai_insights_enabled`             | `true`          | `false`     |
| `behaviour.ai_narrative_enabled`            | `true`          | `false`     |
| `behaviour.ai_nl_query_enabled`             | `true`          | `false`     |
| `behaviour.behaviour_pulse_enabled`         | `true`          | `false`     |
| `behaviour.parent_portal_behaviour_enabled` | `true`          | `false`     |
| `gradebook.riskDetection.enabled`           | `true`          | `false`     |

**New settings block to add:**

```typescript
ai: z.object({
  gradingEnabled: z.boolean().default(false),
  commentsEnabled: z.boolean().default(false),
  progressSummariesEnabled: z.boolean().default(false),
  nlQueriesEnabled: z.boolean().default(false),
  reportNarrationEnabled: z.boolean().default(false),
  predictionsEnabled: z.boolean().default(false),
  substitutionRankingEnabled: z.boolean().default(false),
  attendanceScanEnabled: z.boolean().default(false),
}).default({});
```

**Integration:** Each AI service must check its corresponding tenant setting before processing. If disabled, return a clear message: "This feature requires opt-in. Enable it in Settings > AI Features."

**Important:** This changes defaults only for NEW tenants. Existing tenants retain their current settings. Do NOT run a migration to flip existing tenants' settings — that's a business decision, not a technical one.

### A.2 — Schedule Missing Cron Jobs (Master Plan 1.3)

**Problem:** Two cleanup processors exist as fully-written code but are never registered in `cron-scheduler.service.ts`:

- `IpCleanupProcessor` — nullifies `source_ip` on contact form submissions older than 90 days
- `ImportFileCleanupProcessor` — deletes S3 files for completed/failed imports older than 24 hours

**Add to `cron-scheduler.service.ts`:**

```typescript
// IP address cleanup — daily 04:00 UTC
await this.notificationsQueue.add(
  IP_CLEANUP_JOB,
  {},
  {
    repeat: { pattern: '0 4 * * *' },
    jobId: 'cron:communications:ip-cleanup',
  },
);

// Import file cleanup — daily 05:00 UTC
await this.importsQueue.add(
  IMPORT_FILE_CLEANUP_JOB,
  {},
  {
    repeat: { pattern: '0 5 * * *' },
    jobId: 'cron:imports:file-cleanup',
  },
);
```

**Safety:** IP cleanup sets `source_ip` to NULL on old contact form records — nothing queries by `source_ip` for functionality. S3 cleanup deletes temp files for imports already completed/failed — files are never read again. Both processors handle edge cases (empty results, S3 failures).

---

## Data Model Changes

None. This phase only changes application-layer defaults and registers existing processors.

---

## Testing Requirements

1. **Tenant settings defaults:** Unit test that a freshly-created tenant settings object has all AI features defaulting to `false`
2. **AI service gate:** For at least 2 AI services, verify that calling the service with the tenant setting disabled returns the opt-in message and does NOT call the Anthropic API
3. **Cron registration:** Verify both jobs are registered in the cron scheduler (integration test or manual verification in BullMQ dashboard)
4. **Existing tenant preservation:** Verify that existing tenants' settings are NOT modified by this change

---

## Definition of Done

- [ ] All 6 existing AI-related defaults flipped to `false` in schema
- [ ] New `ai` settings block added with 8 boolean fields, all defaulting to `false`
- [ ] Each AI service checks its tenant setting before processing
- [ ] Disabled AI service returns clear opt-in message
- [ ] IP cleanup cron registered at 04:00 UTC daily
- [ ] Import file cleanup cron registered at 05:00 UTC daily
- [ ] All existing tests pass (regression check)
- [ ] New tests written per testing requirements
- [ ] `architecture/event-job-catalog.md` updated with the two new cron entries
- [ ] Implementation log entry written in `IMPLEMENTATION-LOG.md`

---

## Implementation Log Entry

When complete, add to `Next Features/GDPR/IMPLEMENTATION-LOG.md`:

```markdown
### Phase A: Quick Wins

- **Status:** COMPLETE
- **Completed:** [date]
- **Implemented by:** [engineer/agent]
- **Commit(s):** [hash]
- **Key decisions:** [any deviations]
- **Schema changes:** None (application-layer only)
- **New endpoints:** None
- **New frontend pages:** None
- **Tests added:** [count]
- **Architecture files updated:** event-job-catalog.md
- **Unlocks:** Phase D (Consent Records) is now available
- **Notes:** [anything Phase D should know about the settings structure]
```
