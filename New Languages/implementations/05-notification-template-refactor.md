# Implementation 05 — NotificationTemplate Refactor

> **Phase:** 2 — Refactor (was P2B)
> **Wave:** 5 (serial — Phase 4/5 language sessions need notification keys to be catalogue-backed)
> **Depends on:** 04 complete & deployed
> **Deploys:** API restart + worker restart + (no web change)
> **Model:** Opus 4.7 / High effort

---

## Goal

Migrate **system** `NotificationTemplate` rows from raw Handlebars strings to `t:`-prefixed message-catalogue keys. Tenant overrides remain raw Handlebars (tenants own their customisations).

After this ships:

- A new notification message catalogue lives at `apps/api/src/modules/notifications/messages/notifications.{locale}.json`.
- Every system notification template row's `subject_template`, `body_template`, `email_html_template`, etc. resolves either to a literal string (legacy / tenant-customised path) OR to the message catalogue when the value starts with `t:`.
- The dispatcher resolves locale via the recipient (parent: household preferred → user preferred → tenant default), looks up the `t:`-prefixed key in the catalogue, and runs the result through Handlebars.
- Adding a new locale to the system templates becomes "drop a new `notifications.{locale}.json` file" — no DB rows.

The 13 system notification template types (verified in current schema) include but aren't limited to: `payment.received`, `invoice.issued`, `invoice.overdue`, `student.absence`, `incident.logged`, `report_card.published`, `appointment.scheduled`, `password.reset`, `email_verification`, `welcome`, `attendance.late`, `behaviour.merit`, `behaviour.demerit` (executor: enumerate the actual rows in production before starting).

## Critical safety constraints

- **Tenant override rows MUST NOT be migrated.** Only system rows where `tenant_id IS NULL` (or whatever signals "system default") get the `t:` treatment.
- **The dispatcher must be backwards compatible during rollout.** A row with raw Handlebars must keep working after the refactor — only newly-flagged `t:` rows hit the catalogue.
- **No silent fallback.** If a `t:` key is missing for the resolved locale, throw — same policy as the web hard-error gate. The dispatcher must NOT silently substitute en for a missing fr translation.
- **Idempotency keys remain stable.** Don't change how dedupe works; that lands in implementation 06 (per-locale suffix). Today's behaviour is "one notification per recipient per event"; that does not change here.

---

## Files to create / modify

### Catalogue

- **Create:** `apps/api/src/modules/notifications/messages/notifications.en.json`
- **Create:** `apps/api/src/modules/notifications/messages/notifications.ar.json`

### Migration

- **Create:** `packages/prisma/migrations/<TIMESTAMP>_migrate_system_notification_templates_to_catalogue/migration.sql` — UPDATE statements that flip system rows' template fields from raw strings to `t:` keys.

### Renderer

- **Create:** `apps/api/src/modules/notifications/template-renderer.ts` — a small wrapper that resolves `t:` keys then runs Handlebars.
- **Create:** `apps/api/src/modules/notifications/template-renderer.spec.ts`
- **Modify:** `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` — use the new renderer.

### Provider integration

- **Modify:** Resend / Twilio / WhatsApp adapters under `apps/worker/src/processors/communications/providers/` — pass `locale` through to the renderer (today they may pass `template + variables` but not `locale` explicitly).

### Tests

- **Create:** `apps/api/src/modules/notifications/template-renderer.integration-spec.ts` — integration test that renders en + ar correctly post-migration.
- **Modify:** existing `dispatch-notifications.processor.spec.ts` — extend tests to cover the `t:` path.

### Docs

- **Modify:** `docs/architecture/event-job-catalog.md` — note that system notification templates are now message-catalogue-backed.
- **Modify:** `docs/architecture/danger-zones.md` — add an entry: "System notification templates use t:-prefixed keys; renaming a key without updating the DB row breaks dispatch."
- **Modify:** `New Languages/IMPLEMENTATION_LOG.md`

---

## Detailed task breakdown

### Task 1 — Inventory system templates in production

- [ ] **Step 1.1 — Connect to NHQS prod (read-only)** and dump every system row:

```bash
ssh root@46.62.244.139
sudo -u edupod psql edupod_prod -c "
  SELECT
    template_key,
    channel,
    locale,
    LEFT(subject_template, 80)     AS subject_preview,
    LEFT(body_template,    120)    AS body_preview
  FROM notification_templates
  WHERE tenant_id IS NULL
  ORDER BY template_key, channel, locale;
" | tee /tmp/system-template-inventory.txt
```

- [ ] **Step 1.2 — Sanity check** that every (template_key, channel) pair has both en and ar rows. If any has only one, flag to user and decide before continuing — do NOT silently fill the gap.

- [ ] **Step 1.3 — Save the inventory** locally as `New Languages/_evidence/notification-system-templates-pre-refactor.txt` and reference in the log.

### Task 2 — Build the message catalogue files

**Files:**

- Create: `apps/api/src/modules/notifications/messages/notifications.en.json`
- Create: `apps/api/src/modules/notifications/messages/notifications.ar.json`

- [ ] **Step 2.1 — Generate the catalogue from the inventory.** Shape per template_key:

```json
// notifications.en.json
{
  "payment_received": {
    "in_app": {
      "subject": "Payment received",
      "body": "We've received your payment of {amount} for {invoice_number}. Thank you!"
    },
    "email": {
      "subject": "Payment received — {invoice_number}",
      "html": "<p>We've received your payment of <strong>{amount}</strong>...</p>",
      "text": "We've received your payment of {amount} for {invoice_number}. Thank you!"
    },
    "sms": {
      "body": "Payment of {amount} received. Ref: {invoice_number}."
    },
    "whatsapp": {
      "body": "Hi {parent_name}, we've received your payment of {amount} for {invoice_number}."
    }
  },
  "invoice_issued": {
    /* ... */
  }
  /* ... */
}
```

- [ ] **Step 2.2 — Build the en file by transcribing the existing system row contents** verbatim. Don't rewrite copy here — that's separate work. The migration is "structural relocation", not "copy improvement".

- [ ] **Step 2.3 — Build the ar file the same way.**

- [ ] **Step 2.4 — Validate JSON:**

```bash
node -e "JSON.parse(require('fs').readFileSync('apps/api/src/modules/notifications/messages/notifications.en.json'))"
node -e "JSON.parse(require('fs').readFileSync('apps/api/src/modules/notifications/messages/notifications.ar.json'))"
```

- [ ] **Step 2.5 — Commit:**

```bash
git add apps/api/src/modules/notifications/messages/
git commit -m "feat(notifications): seed message catalogue for system templates (en + ar)"
```

### Task 3 — Build the renderer

**Files:**

- Create: `apps/api/src/modules/notifications/template-renderer.ts`
- Create: `apps/api/src/modules/notifications/template-renderer.spec.ts`

- [ ] **Step 3.1 — Test first:**

```ts
// apps/api/src/modules/notifications/template-renderer.spec.ts
import { renderTemplate } from './template-renderer';

describe('renderTemplate', () => {
  it('renders a literal Handlebars template directly', () => {
    expect(renderTemplate('Hello {{name}}', { name: 'Ada' }, 'en')).toBe('Hello Ada');
  });

  it('resolves t: prefix against the message catalogue', () => {
    const out = renderTemplate('t:payment_received.in_app.subject', { amount: '100' }, 'en');
    expect(out).toBe('Payment received');
  });

  it('runs Handlebars after resolving t: lookup (variables interpolate)', () => {
    const out = renderTemplate(
      't:payment_received.in_app.body',
      { amount: '€100', invoice_number: 'INV-2026-001' },
      'en',
    );
    expect(out).toContain('€100');
    expect(out).toContain('INV-2026-001');
  });

  it('throws on missing key (no silent fallback)', () => {
    expect(() => renderTemplate('t:does.not.exist', {}, 'en')).toThrow(
      /MISSING_NOTIFICATION_MESSAGE/,
    );
  });

  it('throws on missing locale catalogue', () => {
    expect(() => renderTemplate('t:payment_received.in_app.subject', {}, 'fr')).toThrow(
      /MISSING_NOTIFICATION_LOCALE/,
    );
  });
});
```

- [ ] **Step 3.2 — Implement:**

```ts
// apps/api/src/modules/notifications/template-renderer.ts
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

import * as Handlebars from 'handlebars';

type Catalogue = Record<string, unknown>;

const CATALOGUES = loadCatalogues();

function loadCatalogues(): Record<string, Catalogue> {
  const dir = resolve(__dirname, 'messages');
  const out: Record<string, Catalogue> = {};
  for (const file of readdirSync(dir)) {
    const m = /^notifications\.([a-z]{2,5})\.json$/.exec(file);
    if (!m) continue;
    out[m[1]!] = JSON.parse(readFileSync(resolve(dir, file), 'utf8')) as Catalogue;
  }
  return out;
}

function lookupKey(catalogue: Catalogue, dotted: string): string | undefined {
  const segments = dotted.split('.');
  let node: unknown = catalogue;
  for (const seg of segments) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[seg];
  }
  return typeof node === 'string' ? node : undefined;
}

/**
 * Render a notification template string. If it starts with `t:`, resolve the
 * remainder as a dotted key against the catalogue for the supplied locale,
 * then run Handlebars on the resolved string. Otherwise treat the input as
 * a raw Handlebars template (legacy / tenant override path).
 *
 * Hard error on missing key — no silent fallback to en.
 */
export function renderTemplate(
  template: string,
  variables: Record<string, unknown>,
  locale: string,
): string {
  let source = template;
  if (template.startsWith('t:')) {
    const catalogue = CATALOGUES[locale];
    if (!catalogue) {
      throw new Error(`MISSING_NOTIFICATION_LOCALE: no catalogue for locale "${locale}"`);
    }
    const resolved = lookupKey(catalogue, template.slice(2));
    if (resolved === undefined) {
      throw new Error(
        `MISSING_NOTIFICATION_MESSAGE: key "${template.slice(2)}" not found for locale "${locale}"`,
      );
    }
    source = resolved;
  }
  return Handlebars.compile(source)(variables);
}
```

- [ ] **Step 3.3 — Run unit tests:** `pnpm --filter @school/api test -- template-renderer`

- [ ] **Step 3.4 — Commit:**

```bash
git add apps/api/src/modules/notifications/template-renderer.ts apps/api/src/modules/notifications/template-renderer.spec.ts
git commit -m "feat(notifications): add t:-prefix-aware template renderer with hard-error policy"
```

### Task 4 — Wire the renderer into the dispatch processor

**Files:**

- Modify: `apps/worker/src/processors/communications/dispatch-notifications.processor.ts`

- [ ] **Step 4.1 — Read the existing processor.** It currently does something like `Handlebars.compile(template.subject_template)(vars)`.

- [ ] **Step 4.2 — Replace inline `Handlebars.compile` calls** with `renderTemplate(value, vars, locale)`. Pass `locale` from the recipient's resolved locale (existing logic — household preferred → user preferred → tenant default).

```ts
// Before:
const subject = Handlebars.compile(template.subject_template)(vars);

// After:
import { renderTemplate } from '@school/api/notifications/template-renderer';
const subject = renderTemplate(template.subject_template, vars, recipient.locale);
```

> **Worker import path:** the worker uses raw Prisma + the `apps/api` source where appropriate. If `apps/worker` already imports from `apps/api` via the monorepo, mirror that. If not, lift `template-renderer.ts` to `packages/shared` (smaller diff to import from a shared package) — choose based on what already works in the repo.

- [ ] **Step 4.3 — Update the processor's `.spec.ts`** to cover both the legacy raw-template path (tenant overrides) and the new `t:` path:

```ts
it('renders a tenant override template (raw Handlebars)', async () => {
  /* ... */
});
it('renders a system template via t: lookup', async () => {
  /* ... */
});
it('throws when t: key is missing for the resolved locale', async () => {
  /* ... */
});
```

- [ ] **Step 4.4 — Run:** `pnpm --filter @school/worker test -- dispatch-notifications`

- [ ] **Step 4.5 — Commit:**

```bash
git add apps/worker/src/processors/communications/dispatch-notifications.processor.ts \
        apps/worker/src/processors/communications/dispatch-notifications.processor.spec.ts
git commit -m "feat(worker): dispatch processor uses t:-aware renderer"
```

### Task 5 — Migrate system rows to t: prefixes

**Files:**

- Create: `packages/prisma/migrations/<TIMESTAMP>_migrate_system_notification_templates_to_catalogue/migration.sql`

- [ ] **Step 5.1 — Write the migration.** It UPDATE-s every system row (`tenant_id IS NULL`) to replace the raw Handlebars value with the corresponding `t:` reference.

> The exact column names depend on the existing schema (could be `subject_template`, `body_template`, `email_html_template`, `email_text_template`, `sms_body_template`, `whatsapp_body_template`, etc.). Read the current schema first.

```sql
-- migration.sql
-- Migrate system notification templates from raw Handlebars strings to
-- t:-prefixed catalogue references. Tenant overrides (tenant_id IS NOT NULL)
-- are untouched.

BEGIN;

UPDATE notification_templates
SET subject_template = 't:payment_received.in_app.subject',
    body_template    = 't:payment_received.in_app.body'
WHERE tenant_id IS NULL
  AND template_key = 'payment_received'
  AND channel = 'in_app';

UPDATE notification_templates
SET subject_template = 't:payment_received.email.subject',
    email_html_template = 't:payment_received.email.html',
    email_text_template = 't:payment_received.email.text'
WHERE tenant_id IS NULL
  AND template_key = 'payment_received'
  AND channel = 'email';

-- ...repeat for every (template_key, channel) pair...

COMMIT;
```

- [ ] **Step 5.2 — Apply the migration locally:**

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/edupod_dev \
  npx prisma migrate dev
```

Verify:

```sql
SELECT template_key, channel, subject_template
FROM notification_templates
WHERE tenant_id IS NULL
ORDER BY template_key, channel;
-- Expected: every system row's subject_template starts with 't:'.
```

- [ ] **Step 5.3 — Test against an NHQS prod snapshot.** Restore + apply + verify. Tenant override rows must remain unchanged.

- [ ] **Step 5.4 — Commit:**

```bash
git add packages/prisma/migrations/<TIMESTAMP>_migrate_system_notification_templates_to_catalogue/
git commit -m "feat(db): migrate system notification templates to t: catalogue references"
```

### Task 6 — Integration test: en + ar dispatch

**Files:**

- Create: `apps/api/src/modules/notifications/template-renderer.integration-spec.ts`

- [ ] **Step 6.1 — Write the test:**

```ts
// apps/api/src/modules/notifications/template-renderer.integration-spec.ts
import { renderTemplate } from './template-renderer';

describe('Notification dispatch — locale rendering', () => {
  const vars = {
    parent_name: 'Anya',
    amount: '€100.00',
    invoice_number: 'INV-2026-0001',
  };

  it('payment_received in_app renders cleanly in English', () => {
    const subject = renderTemplate('t:payment_received.in_app.subject', vars, 'en');
    const body = renderTemplate('t:payment_received.in_app.body', vars, 'en');
    expect(subject).toMatch(/Payment received/i);
    expect(body).toContain('€100.00');
    expect(body).toContain('INV-2026-0001');
  });

  it('payment_received in_app renders cleanly in Arabic', () => {
    const subject = renderTemplate('t:payment_received.in_app.subject', vars, 'ar');
    const body = renderTemplate('t:payment_received.in_app.body', vars, 'ar');
    expect(subject.length).toBeGreaterThan(0);
    expect(body).toContain('€100.00');
  });

  it('throws on a hypothetical fr lookup (catalogue not yet shipped)', () => {
    expect(() => renderTemplate('t:payment_received.in_app.subject', vars, 'fr')).toThrow(
      /MISSING_NOTIFICATION_LOCALE/,
    );
  });
});
```

- [ ] **Step 6.2 — Run** the integration test alongside the existing dispatch tests.

- [ ] **Step 6.3 — Commit:**

```bash
git add apps/api/src/modules/notifications/template-renderer.integration-spec.ts
git commit -m "test(notifications): integration coverage for en+ar dispatch via t: catalogue"
```

### Task 7 — Update event-job-catalog

**Files:**

- Modify: `docs/architecture/event-job-catalog.md`

- [ ] **Step 7.1 — Add or update the section** describing the dispatch flow:

```markdown
### communications:dispatch-notifications

System notification templates resolve `t:`-prefixed keys against
`apps/api/src/modules/notifications/messages/notifications.{locale}.json`.
Tenant override rows (with non-null `tenant_id`) continue to use raw Handlebars
strings — tenants own their customisations.

Locale resolution order:

1. `Household.preferred_locale` (added in implementation 06)
2. `User.preferred_locale`
3. `Tenant.default_locale`

Missing key → throws `MISSING_NOTIFICATION_MESSAGE`. The dispatcher does NOT
silently fall back to English. Adding a new locale requires shipping a
`notifications.{locale}.json` file in the same commit that flips the locale
to active in the registry.
```

- [ ] **Step 7.2 — Commit:**

```bash
git add docs/architecture/event-job-catalog.md docs/architecture/danger-zones.md
git commit -m "docs(architecture): document t:-aware notification dispatch and missing-key policy"
```

### Task 8 — Local regression sweep, push, deploy, verify

- [ ] **Step 8.1 — Local battery:**

```bash
turbo lint
turbo type-check
turbo test
```

- [ ] **Step 8.2 — Pre-push branch state check.**
- [ ] **Step 8.3 — `git push origin main && gh run watch`.**
- [ ] **Step 8.4 — Production verification:**
  - On NHQS, trigger a real `payment.received` notification (e.g., apply a payment to an invoice on the test parent's household). Confirm the in-app + email render correctly in en. Switch a user to `ar` and re-trigger. Confirm AR renders correctly.
  - Inspect the raw `notifications` table to confirm the rendered text in the row matches what the catalogue would produce.

- [ ] **Step 8.5 — Append completion entry to `IMPLEMENTATION_LOG.md`.** Include sample rendered notification screenshots if helpful, and the commit SHAs.

---

## Acceptance criteria

- [ ] All system `notification_templates` rows reference `t:` keys
- [ ] Tenant override rows untouched
- [ ] `apps/api/src/modules/notifications/messages/notifications.{en,ar}.json` exist and parse
- [ ] `renderTemplate()` exists and is unit-tested for both legacy + t: paths
- [ ] Dispatch processor uses the new renderer
- [ ] Integration test covers en + ar end-to-end
- [ ] CI green; production deploy successful
- [ ] Live `payment.received` notification on NHQS renders correctly in en + ar
- [ ] No `MISSING_NOTIFICATION_MESSAGE` events in Sentry post-deploy
- [ ] `IMPLEMENTATION_LOG.md` updated

---

## Verification commands

```bash
turbo test -- template-renderer
pnpm --filter @school/worker test -- dispatch-notifications
turbo lint && turbo type-check && turbo test

# Post-deploy: trigger real notification on NHQS via API, then:
ssh root@46.62.244.139 "sudo -u edupod psql edupod_prod -c \"
  SELECT recipient_user_id, channel, subject, LEFT(body_rendered, 80)
  FROM notifications
  WHERE created_at > now() - interval '5 minutes'
  ORDER BY created_at DESC LIMIT 5;
\""
```

---

## Rollback

```bash
# Revert the migration
ssh root@46.62.244.139
sudo -u edupod psql edupod_prod
-- Restore raw Handlebars strings from a backup (taken pre-deploy by the
-- automatic pg_dump in the deploy script). Identify the backup file:
ls -la /var/backups/edupod-prod/ | head
-- Then partially restore notification_templates from that dump.

# Revert the code commits
git revert <last-sha>..<first-sha>
git push origin main
```

> **Coordinate rollback with the user.** Notification template rows are infrastructure — partial restores are tricky.

---

## Notes for the executor

- The exact set of `(template_key, channel)` pairs comes from production. **Do not invent rows.** Inventory first.
- Tenant override detection: today the code likely uses `tenant_id IS NULL` for system rows. Confirm in the schema before writing the migration WHERE clause.
- Keep `notifications.{en,ar}.json` shape consistent. Phase 4/5 implementations literally drop a `notifications.{locale}.json` file in this directory and the dispatcher picks it up automatically — your shape is their template.
- The renderer caches catalogues at module-load. If a hot-reload would be useful in dev, add a `process.env.NODE_ENV === 'development'` guard that re-reads on every call. Don't enable that in prod.
