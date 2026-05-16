# Session 1.5B: Cross-Tenant Audit Ledger + Error Log Redaction & Retention

**Depends on:** Session 1.5A (uses `platform_users.user_id` for `actor_user_id`)
**Unlocks:** Session 1.5C (alert silencing emits audit events); Layer 2D (error diagnostics consume the redacted error log); Layer 4 (AI Copilot reads from the audit ledger + redacted errors as its evidence base)

---

## Objective

Two related deliverables that together form the platform-side observability + accountability foundation:

1. **`platform_audit_logs`** — append-only ledger of every cross-tenant operator action. Today, tenant-scoped actions are logged via the existing `audit_logs` table (with `tenant_id`). Cross-tenant actions taken by a `platform_owner` / `platform_support` (suspend a tenant, reset a user's MFA across tenant boundaries, flush global cache, transfer ownership, toggle a module on behalf of a tenant) have no structured home. They go in `platform_audit_logs` with `actor_user_id`, `action`, `target_resource_type`, `target_resource_id`, `target_tenant_id` (nullable), `payload` (before/after state), `ip_address`, `user_agent`, `reason` (operator-typed string), and a hash chain for tamper detection.

2. **`platform_error_log` redaction + retention** — Layer 2D will surface platform-side errors (Sentry-adjacent, but in-DB and queryable). Without redaction, these errors leak PII (request bodies, query params, exception messages containing user-typed content). Without retention, they accumulate indefinitely. This session ships: a redaction pipeline applied at write time (regex for emails, phone numbers, national IDs, bank accounts, JWT-like strings, common API keys); a retention cron that purges rows older than 90 days; and an admin UI to manage the redaction rules.

After this session, every operator-side action is auditable and every error visible in the dashboard has been through PII redaction. Both are required prerequisites for Layer 4's AI Copilot to read from the system safely.

---

## Critical safety constraints

- **Audit ledger is append-only.** No UPDATE, no DELETE, no soft-delete. Even a "redacted" action stays in the ledger; a redaction is recorded as a NEW audit entry referencing the original. Enforce with a Postgres trigger that raises on UPDATE or DELETE for non-superuser roles. (DZ-PA-2.)
- **Hash chain for tamper detection.** Each audit row has a `prev_hash` + `row_hash` field. `row_hash = sha256(prev_hash || canonical_json(row_minus_hash_fields))`. A daily cron walks the chain and alerts if any link is broken. Doesn't prevent tampering by a Postgres superuser; does detect it after the fact.
- **Audit writes are best-effort but loud.** If the audit write fails, the underlying operator action ALSO fails — return 500 to the operator. Better to refuse the action than perform it unaudited. (Compare to the tenant-side audit interceptor which is async/eventual; this is sync and blocking.)
- **Redaction is destructive — never read raw errors after the redaction pipeline.** Once a redacted row lands in `platform_error_log`, the original error string is gone. Sentry retains the unredacted raw event for incident response; the in-DB log is the redacted view. (DZ-PA-3.)
- **Redaction rules can match too aggressively.** A regex for "email" matches `support@edupod.app` — strings the operator legitimately needs to see. Mitigation: rules are tagged with `severity` (warn vs always-redact) and the UI shows a dry-run preview before applying a new rule.
- **Retention cron is not idempotent across calls.** Once a row is purged, it's gone. The cron has its own audit entry recording how many rows were purged.
- **AI Copilot (Layer 4) reads the redacted view ONLY.** Even with full operator permissions, the AI Copilot's evidence base is the `platform_error_log` table after redaction — not Sentry's raw store. This is the bright-line privacy boundary.

---

## Database

### New tables

```prisma
model PlatformAuditLog {
  id                    String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  actor_user_id         String                @db.Uuid
  action                PlatformAuditAction
  target_resource_type  String                @db.VarChar(60)   // 'tenant' | 'user' | 'queue' | 'cache' | 'maintenance' | 'platform_user' | 'alert_rule' | 'alert_silence' | 'module_toggle' | etc.
  target_resource_id    String?               @db.VarChar(255)  // resource id (UUID, queue name, cache key, etc.)
  target_tenant_id      String?               @db.Uuid          // when the action affects a specific tenant
  payload               Json                  @db.JsonB         // { before: {...}, after: {...}, extra: {...} }
  reason                String?               @db.Text          // operator-typed justification for high-blast actions
  ip_address            String?               @db.VarChar(45)   // ipv6 max
  user_agent            String?               @db.VarChar(500)
  prev_hash             String?               @db.VarChar(64)   // null for the first row only
  row_hash              String                @db.VarChar(64)
  created_at            DateTime              @default(now()) @db.Timestamptz()

  actor                 User                  @relation(fields: [actor_user_id], references: [id], onDelete: Restrict)

  @@map("platform_audit_logs")
  @@index([actor_user_id, created_at(sort: Desc)])
  @@index([action, created_at(sort: Desc)])
  @@index([target_tenant_id, created_at(sort: Desc)])
  @@index([created_at(sort: Desc)])
}

model PlatformErrorLog {
  id                    String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  occurred_at           DateTime              @default(now()) @db.Timestamptz()
  source                String                @db.VarChar(40)   // 'api' | 'worker' | 'web-ssr' | 'web-csr' | 'cron'
  level                 String                @db.VarChar(20)   // 'error' | 'warn'
  message_redacted      String                @db.Text          // post-redaction message
  stack_redacted        String?               @db.Text          // post-redaction stack trace
  fingerprint           String                @db.VarChar(64)   // hash of redacted message + first stack frame; for grouping
  count                 Int                   @default(1)       // number of times this fingerprint occurred (incremented on duplicate insert)
  first_seen_at         DateTime              @default(now()) @db.Timestamptz()
  last_seen_at          DateTime              @default(now()) @db.Timestamptz()
  redaction_metadata    Json                  @db.JsonB         // { rules_applied: [...], pre_redaction_length: N, post_redaction_length: N }
  tenant_id_redacted    String?               @db.Uuid          // best-effort tenant attribution; redacted if rule matches user-typed tenant ref
  correlation_id        String?               @db.VarChar(64)   // request-scoped correlation id (Layer 4A standardises this)
  sentry_event_id       String?               @db.VarChar(64)   // pointer to Sentry's raw event for IR escalation
  created_at            DateTime              @default(now()) @db.Timestamptz()

  @@map("platform_error_log")
  @@index([fingerprint, last_seen_at(sort: Desc)])
  @@index([occurred_at(sort: Desc)])
  @@index([source, level, occurred_at(sort: Desc)])
}

model PlatformErrorRedactionRule {
  id              String                       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name            String                       @db.VarChar(100)
  pattern         String                       @db.Text          // regex source
  pattern_flags   String                       @default('g') @db.VarChar(10)
  replacement     String                       @default('[REDACTED]') @db.VarChar(60)
  severity        String                       @db.VarChar(10)   // 'always' | 'warn'
  is_enabled      Boolean                      @default(true)
  created_by_user_id String                    @db.Uuid
  created_at      DateTime                     @default(now()) @db.Timestamptz()
  updated_at      DateTime                     @updatedAt @db.Timestamptz()

  created_by      User                         @relation(fields: [created_by_user_id], references: [id], onDelete: Restrict)

  @@map("platform_error_redaction_rules")
  @@index([is_enabled])
}

enum PlatformAuditAction {
  // Tenants
  tenant_create
  tenant_suspend
  tenant_reactivate
  tenant_archive

  // Users
  user_password_reset_triggered
  user_mfa_reset
  user_account_unlocked
  user_disabled
  user_enabled
  tenant_ownership_transferred

  // Modules (mirrors Module Gating tenant.module.toggle but cross-tenant POV)
  module_toggled

  // Cache
  cache_flushed_tenant
  cache_flushed_global

  // Queues
  queue_paused
  queue_resumed
  queue_cleaned
  job_retried
  job_removed

  // Maintenance
  maintenance_mode_entered
  maintenance_mode_exited
  maintenance_window_scheduled
  maintenance_window_cancelled

  // Sessions
  session_force_logged_out_user
  session_force_logged_out_tenant

  // Platform users (self-referential audit)
  platform_user_invited
  platform_user_revoked
  platform_role_granted
  platform_role_revoked

  // Alerts
  alert_acknowledged
  alert_resolved
  alert_silenced
  alert_rule_disabled

  // Two-person approval (1.5C)
  two_person_request_initiated
  two_person_request_approved
  two_person_request_rejected

  // AI Copilot (Layer 4)
  ai_action_proposed
  ai_action_approved
  ai_action_executed
  ai_action_rejected
}
```

### Append-only enforcement

`packages/prisma/migrations/<timestamp>_platform_audit_append_only/post_migrate.sql`:

```sql
CREATE OR REPLACE FUNCTION platform_audit_block_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'platform_audit_logs is append-only; UPDATE/DELETE not permitted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER platform_audit_logs_no_update
  BEFORE UPDATE ON platform_audit_logs
  FOR EACH ROW EXECUTE FUNCTION platform_audit_block_mutation();

CREATE TRIGGER platform_audit_logs_no_delete
  BEFORE DELETE ON platform_audit_logs
  FOR EACH ROW EXECUTE FUNCTION platform_audit_block_mutation();
```

(Postgres superuser bypasses triggers — accepted; the hash chain catches it.)

---

## API + service layer

### `PlatformAuditService`

`apps/api/src/modules/platform-audit/platform-audit.service.ts`:

```ts
@Injectable()
export class PlatformAuditService {
  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {}

  /**
   * Synchronously write an audit entry. Throws if the write fails — caller
   * MUST allow the throw to propagate so the underlying action is also aborted.
   * The hash chain is computed here.
   */
  async log(input: {
    actor_user_id: string;
    action: PlatformAuditAction;
    target_resource_type: string;
    target_resource_id?: string;
    target_tenant_id?: string;
    payload: { before?: unknown; after?: unknown; extra?: unknown };
    reason?: string;
    ip_address?: string;
    user_agent?: string;
  }): Promise<void> {
    /* ... */
  }

  /**
   * Walk the hash chain and verify each row's hash matches.
   * Returns the first broken link or null if intact.
   */
  async verifyChainIntegrity(): Promise<{ broken_at: string | null }> {
    /* ... */
  }
}
```

Daily cron at 04:30 UTC (registered in `CronSchedulerService`) calls `verifyChainIntegrity` and fires a `platform:alerts` event if a break is detected.

### Static-analysis test

`apps/api/src/modules/platform-audit/audit-coverage.spec.ts`:

Scans every controller in `apps/api/src/modules/` for endpoints carrying `@RequiresPlatformPermission(...)` and asserts the corresponding service method calls `PlatformAuditService.log()` (heuristic: import + invocation). Methods that legitimately don't audit must carry `@SkipPlatformAudit('reason: ...')`.

### `PlatformErrorLogService`

`apps/api/src/modules/platform-error-log/platform-error-log.service.ts`:

```ts
@Injectable()
export class PlatformErrorLogService {
  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    private readonly redactor: ErrorRedactorService,
  ) {}

  /**
   * Capture an error event. Applies redaction, computes fingerprint,
   * upserts on (fingerprint) — increments count + updates last_seen_at
   * if the fingerprint already exists.
   */
  async capture(input: {
    source: 'api' | 'worker' | 'web-ssr' | 'web-csr' | 'cron';
    level: 'error' | 'warn';
    message: string;
    stack?: string;
    tenant_id?: string;
    correlation_id?: string;
    sentry_event_id?: string;
  }): Promise<void> {
    /* ... */
  }

  async listRedacted(filters: ListRedactedDto): Promise<Paginated<PlatformErrorLog>> {
    /* ... */
  }
}
```

### `ErrorRedactorService`

`apps/api/src/modules/platform-error-log/error-redactor.service.ts`:

```ts
@Injectable()
export class ErrorRedactorService {
  // Default rules baked in (always-active, can't be disabled):
  private static readonly BUILT_IN_RULES = [
    {
      name: 'email',
      pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
      flags: 'g',
      replacement: '[EMAIL]',
    },
    { name: 'phone', pattern: '\\+?[0-9][0-9\\s-]{8,15}', flags: 'g', replacement: '[PHONE]' },
    {
      name: 'jwt',
      pattern: 'eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}',
      flags: 'g',
      replacement: '[JWT]',
    },
    {
      name: 'stripe_key',
      pattern: 'sk_(live|test)_[A-Za-z0-9]{24,}',
      flags: 'g',
      replacement: '[STRIPE_SK]',
    },
    { name: 'aws_access_key', pattern: 'AKIA[0-9A-Z]{16}', flags: 'g', replacement: '[AWS_KEY]' },
    { name: 'irish_pps', pattern: '\\b\\d{7}[A-Za-z]{1,2}\\b', flags: 'g', replacement: '[PPS]' },
    {
      name: 'iban_ie',
      pattern: '\\bIE\\d{2}[A-Z0-9]{4}\\d{14}\\b',
      flags: 'g',
      replacement: '[IBAN]',
    },
  ];

  async redact(input: string): Promise<{ redacted: string; rules_applied: string[] }> {
    /* ... */
  }
}
```

Custom rules from `platform_error_redaction_rules` are layered on top.

### Retention cron

Daily at 04:00 UTC: delete rows from `platform_error_log` where `last_seen_at < now() - interval '90 days'`. Audit-log the count.

### New controllers

```
GET    /v1/admin/platform-audit-logs                       -> @RequiresPlatformPermission('platform.audit_log.view')
GET    /v1/admin/platform-audit-logs/:id                   -> @RequiresPlatformPermission('platform.audit_log.view')
GET    /v1/admin/platform-error-log                        -> @RequiresPlatformPermission('platform.audit_log.view')
GET    /v1/admin/platform-error-log/redaction-rules        -> @RequiresPlatformPermission('platform.platform_users.view')
POST   /v1/admin/platform-error-log/redaction-rules        -> @RequiresPlatformPermission('platform.platform_users.assign_roles')  // owner-only by default
DELETE /v1/admin/platform-error-log/redaction-rules/:id    -> @RequiresPlatformPermission('platform.platform_users.assign_roles')
POST   /v1/admin/platform-error-log/redaction-rules/preview -> dry-run a new rule against last 100 events; show match counts and sample redactions
```

---

## Frontend

### New pages

`apps/web/src/app/[locale]/(platform)/admin/audit-log/platform/page.tsx`:

- Filters: actor (multi-select), action (multi-select), target_tenant (search), date range.
- Table: timestamp, actor (email + role badge), action, target, payload preview (expandable JSON), reason.
- Click a row → side panel with full payload + "View hash chain neighbours" (showing prev/next entries).

`apps/web/src/app/[locale]/(platform)/admin/error-log/page.tsx`:

- Group by fingerprint with count + last-seen.
- Click a fingerprint → expand to show recent occurrences.
- Each row: source, level, redacted message, occurrence count, last_seen, "Open in Sentry" link (uses `sentry_event_id`).

`apps/web/src/app/[locale]/(platform)/admin/settings/redaction-rules/page.tsx`:

- Built-in rules: read-only, marked clearly.
- Custom rules: editable.
- "Preview" button: runs the dry-run endpoint and shows what would have changed.
- "Disable rule" toggle (soft-disable; rule stays in DB).

### New components

- `PlatformAuditTable` — paginated, filter-aware table.
- `RedactedErrorCard` — fingerprint-grouped display with count badge.
- `RedactionRuleEditor` — regex editor with test input box.

---

## Tests

### Unit

- `error-redactor.service.spec.ts` — fed a synthetic corpus with each PII pattern. Asserts post-redaction string contains none of the originals. Includes adversarial cases (pattern split across newlines, Unicode lookalikes for digits).
- `platform-audit.service.spec.ts` — log() succeeds; chain hash matches expected; verifyChainIntegrity() detects a manually-corrupted row.

### Integration

- `audit-trigger.e2e.ts` — UPDATE/DELETE on `platform_audit_logs` raises the trigger error.
- `error-log-retention.spec.ts` — seed rows older than 90 days, run cron, verify deletion + audit entry.

### Static analysis

- `audit-coverage.spec.ts` — every `@RequiresPlatformPermission(...)` endpoint either calls `PlatformAuditService.log()` in its handler chain OR carries `@SkipPlatformAudit('reason: ...')`. Failure listing per file.

### E2E

- Operator suspends a tenant → check `/admin/audit-log/platform` immediately shows the entry with correct payload (before: status='active', after: status='suspended').
- Operator triggers an error in a tenant context → check `/admin/error-log` shows the redacted entry; raw email + JWT in the original error are NOT visible.

---

## Acceptance

- [x] `platform_audit_logs` exists with append-only triggers; UPDATE/DELETE raises.
- [x] Hash chain populated on every write; verification cron runs daily and alerts on break.
- [x] Every existing platform-side mutation endpoint writes an audit entry (verified by static-analysis test).
- [x] `platform_error_log` exists; redaction pipeline applied at write time.
- [x] Built-in redaction rules cover: email, phone, JWT, Stripe SK, AWS access key, Irish PPS, IBAN-IE.
- [x] Retention cron purges rows older than 90 days; purge audited.
- [x] Frontend pages: `/admin/audit-log/platform`, `/admin/error-log`, `/admin/settings/redaction-rules` all functional.
- [x] Redaction round-trip test passes for the synthetic PII corpus.
- [x] `docs/architecture/danger-zones.md` gains DZ-PA-2 (audit append-only) and DZ-PA-3 (redaction is destructive).
- [x] `docs/architecture/event-job-catalog.md` gains the daily hash-chain verification cron and the daily retention cron.

---

## Notes

- The audit ledger and error log are platform-level (no `tenant_id` on the rows themselves; `target_tenant_id` is informational). Exempt from RLS — consumed only by `@RequiresPlatformPermission('platform.audit_log.view')` endpoints.
- Sentry stays as the unredacted source-of-truth for incident response. The in-DB error log is for the dashboard + Layer 4 AI Copilot. Pointer fields (`sentry_event_id`) link the two.
- Custom redaction rules are owner-only by default because a malicious or careless support user could add a rule that hides their own actions. Permission `platform.platform_users.assign_roles` was chosen as the proxy — same blast surface as adding a role.
- Layer 4 (AI Copilot) reads the redacted log via the same `/admin/platform-error-log` endpoint. No separate AI-only data path. The AI sees what the operator sees.
- The hash-chain alert on integrity break is a P1 incident — the runbook (added in Layer 4A) escalates to direct operator notification regardless of normal alert routing.

---

## Commits / CI / Notes

- Implementation commit: `d54287eb9cbee85533ff377050e888a6932302ff` (`feat(platform): add audit ledger and error redaction`).
- CI/deploy run: <https://github.com/ACANOTES-dev/EduPod/actions/runs/25958456127> — passed and deployed through CI on 2026-05-16.
- Production smoke: passed on 2026-05-16 against `https://dua.edupod.app`; verified login, platform dashboard, platform audit ledger, redacted error log, redaction rules, tenant list/detail, health, alerts, onboarding tracker, platform users, and permissions pages.
