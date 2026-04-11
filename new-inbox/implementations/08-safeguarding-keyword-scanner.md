# Implementation 08 — Safeguarding Keyword Scanner

> **Wave:** 3 (parallel with 06, 07, 09)
> **Depends on:** 01, 04
> **Deploys:** API + Worker restart

---

## Goal

Scan **every new message** against a tenant-managed keyword list and surface matches as `MessageFlag` rows + dashboard alerts to Owner / Principal / Vice Principal. Built behind a clean interface so a v2 ML scanner can swap in without touching the rest of the pipeline.

## What to build

### 1. The scanner interface

`apps/api/src/modules/safeguarding/scanner/safeguarding-scanner.interface.ts`

```ts
export interface SafeguardingScanner {
  readonly key: string; // 'keyword' for v1, 'ml' for v2

  scan(input: { tenantId: string; body: string }): Promise<{
    matches: Array<{
      keyword: string;
      severity: MessageFlagSeverity;
      category: string;
      position: number;
    }>;
    highest_severity: MessageFlagSeverity | null;
  }>;
}
```

The interface lives in a brand-new `safeguarding` module (separate from `inbox`) so the scanner can be reused for other content sources later (e.g. event comments, parent inquiries, homework submissions).

### 2. The keyword scanner implementation

`apps/api/src/modules/safeguarding/scanner/keyword-safeguarding-scanner.ts`

```ts
@Injectable()
export class KeywordSafeguardingScanner implements SafeguardingScanner {
  readonly key = 'keyword';

  constructor(
    private readonly keywordsRepo: SafeguardingKeywordsRepository,
  ) {}

  async scan({ tenantId, body }) {
    const keywords = await this.keywordsRepo.findActiveByTenant(tenantId);
    // cached per tenant for 5 minutes via in-memory LRU

    const lowered = body.toLowerCase();
    const matches: Array<{...}> = [];

    for (const kw of keywords) {
      // word-boundary-aware search via regex
      const pattern = new RegExp(`\\b${escapeRegex(kw.keyword.toLowerCase())}\\b`, 'g');
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(lowered)) !== null) {
        matches.push({ keyword: kw.keyword, severity: kw.severity, category: kw.category, position: m.index });
      }
    }

    const highest_severity = matches.length === 0 ? null
      : matches.some(m => m.severity === 'high') ? 'high'
      : matches.some(m => m.severity === 'medium') ? 'medium'
      : 'low';

    return { matches, highest_severity };
  }
}
```

Key points:

- **Word boundaries** to avoid false positives (`gun` should not match `begun`).
- **Case insensitive** at the body and keyword level.
- **All matches reported**, not just the first — the flag row stores the union.
- **Caching** is per-tenant, 5-minute TTL via the same LRU pattern as the policy cache.
- **escapeRegex** is essential — keywords are user-supplied text and may contain regex metacharacters. Escape them. Test with a keyword like `c++`.

### 3. Keyword repository + service + controller

`apps/api/src/modules/safeguarding/keywords/safeguarding-keywords.service.ts`

CRUD for `safeguarding_keywords`:

```ts
async list(tenantId: string): Promise<SafeguardingKeyword[]>;
async create(tenantId: string, dto: CreateKeywordDto): Promise<SafeguardingKeyword>;
async update(tenantId: string, id: string, dto: UpdateKeywordDto): Promise<SafeguardingKeyword>;
async setActive(tenantId: string, id: string, active: boolean): Promise<void>;
async delete(tenantId: string, id: string): Promise<void>;
async bulkImport(tenantId: string, dto: BulkImportDto): Promise<{ imported: number; skipped: number }>;
```

`bulkImport` accepts a CSV-style payload `[{ keyword, severity, category }, ...]` for tenants that want to seed a large list at once. Skips duplicates via `ON CONFLICT DO NOTHING`.

Controller:

```
GET    /v1/safeguarding/keywords
POST   /v1/safeguarding/keywords
PATCH  /v1/safeguarding/keywords/:id
DELETE /v1/safeguarding/keywords/:id
POST   /v1/safeguarding/keywords/bulk-import
```

All behind `@RequiresPermission('safeguarding.keywords.write')` (new permission, add to seed) — admin tier only.

### 4. The two BullMQ processors

`apps/worker/src/processors/safeguarding-scan-message.processor.ts`

```ts
@Processor(QUEUE_NAMES.SAFEGUARDING)
export class SafeguardingScanMessageProcessor extends WorkerHost {
  async process(job: Job): Promise<void> {
    if (job.name !== SAFEGUARDING_SCAN_MESSAGE_JOB) return;
    const { tenant_id, message_id } = job.data;

    await this.runInTenantContext(tenant_id, async (tx) => {
      const message = await tx.message.findUnique({ where: { id: message_id } });
      if (!message || message.deleted_at) return;

      const result = await this.scanner.scan({ tenantId: tenant_id, body: message.body });
      if (result.matches.length === 0) return;

      // Upsert the flag — if a flag already exists for this message (e.g. from a re-scan after edit), update it.
      const flag = await tx.messageFlag.upsert({
        where: { message_id_unique: message_id }, // add a unique constraint in impl 01 if missing
        create: {
          tenant_id,
          message_id,
          matched_keywords: result.matches.map((m) => m.keyword),
          highest_severity: result.highest_severity,
          review_state: 'pending',
        },
        update: {
          matched_keywords: result.matches.map((m) => m.keyword),
          highest_severity: result.highest_severity,
          review_state: 'pending',
          reviewed_by_user_id: null,
          reviewed_at: null,
        },
      });

      // Enqueue the notify job
      await this.safeguardingQueue.add(SAFEGUARDING_NOTIFY_REVIEWERS_JOB, {
        tenant_id,
        message_flag_id: flag.id,
      });
    });
  }
}
```

`apps/worker/src/processors/safeguarding-notify-reviewers.processor.ts`

```ts
@Processor(QUEUE_NAMES.SAFEGUARDING)
export class SafeguardingNotifyReviewersProcessor extends WorkerHost {
  async process(job: Job): Promise<void> {
    if (job.name !== SAFEGUARDING_NOTIFY_REVIEWERS_JOB) return;
    const { tenant_id, message_flag_id } = job.data;

    await this.runInTenantContext(tenant_id, async (tx) => {
      // 1. Find all admin tier users (Owner / Principal / VP) for this tenant.
      const reviewers = await this.usersReadFacade.findAdminTierIds(tx, tenant_id);

      // 2. Insert a Notification row for each (re-uses the existing platform notification system).
      for (const userId of reviewers) {
        await tx.notification.create({
          data: {
            tenant_id,
            user_id: userId,
            type: 'safeguarding_flag',
            title: 'Safeguarding alert: a conversation needs review',
            body: 'A new message has been flagged by the safeguarding scanner. Click to review.',
            metadata_json: { message_flag_id },
            read_at: null,
          },
        });
      }
    });
  }
}
```

These two processors live on a **new BullMQ queue**: `safeguarding`. Add it to `apps/worker/src/base/queue.constants.ts`:

```ts
export const QUEUE_NAMES = {
  // ... existing
  SAFEGUARDING: 'safeguarding',
} as const;

export const SAFEGUARDING_SCAN_MESSAGE_JOB = 'safeguarding:scan-message';
export const SAFEGUARDING_NOTIFY_REVIEWERS_JOB = 'safeguarding:notify-reviewers';
```

### 5. Wire up scan trigger

In `apps/api/src/modules/inbox/conversations/conversations.service.ts` (impl 04 created the placeholder), the existing enqueue calls for `safeguarding:scan-message` should now actually enqueue on the new `safeguarding` queue, not on the notifications queue.

Make sure the queue name in `InboxModule`'s `BullModule.registerQueue` matches.

### 6. Edit triggers a rescan

When `MessagesService.editMessage` runs, it must enqueue a rescan of the message. The previous flag (if any) is overwritten with the new scan result. If the new scan is empty, the flag row is **deleted** (not just dismissed) — the previous content was the safeguarding concern, not the current.

Add a small edit-rescan hook in messages.service.ts:

```ts
// after the body update
await this.safeguardingQueue.add(SAFEGUARDING_SCAN_MESSAGE_JOB, {
  tenant_id: input.tenantId,
  message_id: input.messageId,
});
```

### 7. Module wiring

New module: `apps/api/src/modules/safeguarding/safeguarding.module.ts`

Providers:

- `KeywordSafeguardingScanner` (provided as `SAFEGUARDING_SCANNER` token, an injection token)
- `SafeguardingKeywordsService`
- `SafeguardingKeywordsController`
- `SafeguardingKeywordsRepository`

Exports:

- `SAFEGUARDING_SCANNER` (so worker processors can inject it)
- `SafeguardingKeywordsService` (in case other modules need it)

Worker imports `SafeguardingModule`. Inbox module does **not** import safeguarding directly — the trigger is via BullMQ.

## Tests

`keyword-safeguarding-scanner.spec.ts`:

- empty keyword list → no matches
- exact match → 1 match
- multiple matches in one body → all reported
- case insensitive
- word boundary respected (`gun` not matching `begun`)
- regex metachars in keyword (`c++`) escaped properly
- highest_severity computed correctly (low, medium, high mix)
- inactive keywords ignored

`safeguarding-keywords.service.spec.ts`:

- CRUD lifecycle
- bulkImport with duplicates skipped
- RLS scoped per tenant

`safeguarding-scan-message.processor.spec.ts`:

- Routes by job.name
- Skips deleted messages
- No matches → no flag created
- With matches → upserts flag, enqueues notify job
- Re-scan of an existing flagged message updates the flag

`safeguarding-notify-reviewers.processor.spec.ts`:

- Loads all admin tier users
- Inserts a notification row per reviewer
- Idempotent on re-fire (notification table has its own dedupe)

## Watch out for

- **Word boundaries with non-Latin characters.** The `\\b` in JavaScript regex is ASCII-only. For Arabic content, `\\b` will not match Arabic word boundaries correctly. Document this limitation; v1 ships ASCII-aware. v2 with a multilingual-aware regex or ML scanner can address it.
- **The starter keyword set** seeded in impl 01 is intentionally generic and uncontroversial. Don't add political, religious, or culturally sensitive terms — every tenant has their own context. The seed is a starting template, not a safeguarding policy.
- **Performance.** A tenant with 1000 keywords and a 5000-character message: the regex loop is O(keywords × body length). For v1 this is fine (the cache amortises the keyword fetch and the regex is fast). If a tenant ever hits 10k keywords, swap to an Aho–Corasick automaton.
- **The unique constraint on `message_flags.message_id`** is needed for the upsert. If impl 01 didn't add it, add a follow-up migration in this impl. It's a simple `CREATE UNIQUE INDEX IF NOT EXISTS uniq_message_flags_message_id ON message_flags (message_id);`.
- **Don't dispatch notifications via the existing fallback worker.** The safeguarding alert is a separate notification type — it should land on the admin's dashboard widget (impl 14), not via SMS. If a tenant explicitly wants SMS escalation for safeguarding, that's a v2 feature.
- **Privacy of the keyword list.** The keyword list is tenant-scoped and never visible to non-admin users. Don't accidentally expose `safeguarding_keywords` via any API endpoint other than the controller above. Add an integration test that asserts a teacher receives 403 on `/v1/safeguarding/keywords`.
- **Don't scan messages from the SYSTEM_USER_SENTINEL.** Freeze / unfreeze system messages aren't user content. Skip the scan for messages where `sender_user_id = SYSTEM_USER_SENTINEL`.

## Deployment notes

- Both API and worker restart.
- After deploy:
  - `pm2 logs worker | grep safeguarding` shows the new processors registering.
  - `GET /v1/safeguarding/keywords` as Principal → returns the seeded starter list.
  - Send a test direct message containing one of the seeded keywords as Principal → check the worker logs for the scan + notify firing → check the notifications table for the new entry on the principal's user.
