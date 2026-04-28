# Implementation 06 — Dual-Language Household Dispatch Fanout

> **Phase:** 3 — Dispatch (was P3)
> **Wave:** 6 (serial — Phase 4/5 implementations need fanout in place to actually use the second locale)
> **Depends on:** 05 complete & deployed
> **Deploys:** API restart + worker restart + web restart
> **Model:** Opus 4.7 / High effort

---

## Goal

Households can opt into dual-language parent communications. When the dispatcher fans out a notification to a household with the opt-in enabled and a non-null `secondary_locale` distinct from the resolved default, **two** notification rows are emitted — one in the default locale, one in the secondary — each with its own idempotency key suffix.

After this ships:

- Household profile UI (parent-facing) has a `secondary_locale` dropdown (sourced from `tenant.supported_locales`) and a `dual_language_opt_in` toggle.
- `NotificationDispatcher.fanout(notification, household)` service implements the `(opt_in × secondary_locale × default_locale)` logic.
- Idempotency keys are suffixed `-{locale}` so the second emit isn't deduped against the first.
- Audit log shows both dispatched notifications with explicit locale tags.
- Integration test triggers a real-ish `payment.received` and asserts exactly two notifications.

The fanout rule (lifted verbatim from STRATEGY.md §3.3):

| `dual_language_opt_in` | `secondary_locale` | `default_locale` | Result                                |
| ---------------------- | ------------------ | ---------------- | ------------------------------------- |
| `false`                | any                | any              | 1 notification (default)              |
| `true`                 | `null`             | any              | 1 notification (default)              |
| `true`                 | `'fr'`             | `'en'`           | 2 notifications (en first, fr second) |
| `true`                 | `'en'`             | `'en'`           | 1 notification (no-op duplicate)      |

## Critical safety constraints

- **Default-language version always sent FIRST.** Audit ordering preserves which is canonical.
- **Idempotency keys MUST suffix the locale** — otherwise the second emit is deduped against the first by the existing dedupe logic.
- **Opt-in only affects parent-bound notifications.** Staff/admin notifications, system errors, internal job notifications: single-locale path always.
- **Tenant locale gate still applies.** If a parent's `secondary_locale` is somehow set to a code not in `tenant.supported_locales` (race condition, misconfigured admin), fall back to single-locale dispatch and log a warning. Don't throw — that would block a legitimate notification.

---

## Files to create / modify

### Schema / endpoint

- **Modify:** `apps/api/src/modules/households/households.controller.ts` — add `PATCH /v1/households/:id/locale-preferences`.
- **Modify:** `apps/api/src/modules/households/households.service.ts` — add `updateLocalePreferences(householdId, tenantId, dto)`.
- **Modify:** `packages/shared/src/i18n/locale-codes.ts` — extend `householdLocaleUpdateSchema` if needed (already drafted in 01).

### Frontend

- **Create:** `apps/web/src/app/[locale]/(school)/parent/household/_components/locale-preferences-card.tsx` — the UI.
- **Modify:** `apps/web/src/app/[locale]/(school)/parent/household/page.tsx` — wire the card in.

### Dispatch fanout

- **Create:** `apps/worker/src/processors/communications/notification-fanout.ts` — the fanout function.
- **Create:** `apps/worker/src/processors/communications/notification-fanout.spec.ts` — unit tests for every permutation.
- **Modify:** `apps/worker/src/processors/communications/dispatch-notifications.processor.ts` — call `fanout()` instead of single-emit logic.

### Tests

- **Create:** `apps/api/test/household-locale-preferences.e2e-spec.ts` — e2e for the endpoint.
- **Create:** `apps/worker/src/processors/communications/dispatch-fanout.integration-spec.ts` — integration test that triggers an end-to-end dispatch and asserts two rows.
- **Create:** `apps/web/e2e/dual-language-household.spec.ts` — Playwright journey: parent opts in, picks secondary, saves, persists.

### Docs

- **Modify:** `docs/architecture/event-job-catalog.md` — document the fanout rule.
- **Modify:** `docs/architecture/state-machines.md` — ensure household opt-in state is captured.
- **Modify:** `docs/architecture/danger-zones.md` — add an entry on idempotency suffixing.

---

## Detailed task breakdown

### Task 1 — Backend household locale-preferences endpoint

**Files:**

- Modify: `apps/api/src/modules/households/households.service.ts`
- Modify: `apps/api/src/modules/households/households.controller.ts`

- [ ] **Step 1.1 — Service method:**

```ts
// apps/api/src/modules/households/households.service.ts (additions)
import { householdLocaleUpdateSchema, type HouseholdLocaleUpdate } from '@school/shared';

async updateLocalePreferences(
  tenantId: string,
  householdId: string,
  dto: HouseholdLocaleUpdate
): Promise<{
  id: string;
  secondary_locale: string | null;
  dual_language_opt_in: boolean;
}> {
  return createRlsClient(this.prisma, { tenant_id: tenantId }).$transaction(async (tx) => {
    const household = await tx.household.findFirst({
      where: { id: householdId, tenant_id: tenantId },
      select: { id: true, secondary_locale: true, dual_language_opt_in: true },
    });
    if (!household) {
      throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND', message: `Household "${householdId}" not found` });
    }

    if (dto.secondary_locale !== undefined && dto.secondary_locale !== null) {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { supported_locales: true },
      });
      if (!tenant || !tenant.supported_locales.includes(dto.secondary_locale)) {
        throw new BadRequestException({
          code: 'LOCALE_NOT_SUPPORTED',
          message: `Locale "${dto.secondary_locale}" is not enabled for this tenant.`,
        });
      }
    }

    const updated = await tx.household.update({
      where: { id: householdId },
      data: {
        secondary_locale: dto.secondary_locale ?? household.secondary_locale,
        dual_language_opt_in: dto.dual_language_opt_in ?? household.dual_language_opt_in,
      },
      select: { id: true, secondary_locale: true, dual_language_opt_in: true },
    });
    return updated;
  }) as unknown as { id: string; secondary_locale: string | null; dual_language_opt_in: boolean };
}
```

- [ ] **Step 1.2 — Controller route:**

```ts
// apps/api/src/modules/households/households.controller.ts
@Patch(':id/locale-preferences')
@RequiresPermission('household.manage_own')
async updateLocalePreferences(
  @CurrentTenant() tenant: TenantContext,
  @Param('id', ParseUUIDPipe) id: string,
  @Body(new ZodValidationPipe(householdLocaleUpdateSchema)) body: HouseholdLocaleUpdate,
) {
  return this.householdsService.updateLocalePreferences(tenant.tenant_id, id, body);
}
```

> **Permission note:** `household.manage_own` should already exist (it's how parents edit their household profile today). Reuse it. Do NOT introduce a new permission.

- [ ] **Step 1.3 — E2E test:**

```ts
// apps/api/test/household-locale-preferences.e2e-spec.ts
//
// PATCH /v1/households/:id/locale-preferences
//   - 200 sets opt_in=true + secondary_locale='fr' on a household where tenant supports fr
//   - 400 LOCALE_NOT_SUPPORTED when secondary_locale is not in tenant.supported_locales
//   - 404 when caller is not a member of the household
//   - 200 setting secondary_locale=null and opt_in=false clears both
```

- [ ] **Step 1.4 — Run:** `pnpm --filter @school/api test:e2e -- household-locale-preferences`

- [ ] **Step 1.5 — Commit:**

```bash
git add apps/api/src/modules/households/ apps/api/test/household-locale-preferences.e2e-spec.ts
git commit -m "feat(api): household locale-preferences endpoint (secondary_locale + opt_in)"
```

### Task 2 — Build the fanout function

**Files:**

- Create: `apps/worker/src/processors/communications/notification-fanout.ts`
- Create: `apps/worker/src/processors/communications/notification-fanout.spec.ts`

- [ ] **Step 2.1 — Test first** (cover every permutation in the rule table):

```ts
// apps/worker/src/processors/communications/notification-fanout.spec.ts
import { fanoutNotification } from './notification-fanout';

describe('fanoutNotification', () => {
  const baseNotification = {
    template_key: 'payment_received',
    channel: 'email',
    variables: { amount: '€100', invoice_number: 'INV-001' },
    idempotency_key: 'evt-123',
  };

  const baseHousehold = {
    id: 'hh-1',
    tenant_id: 't-1',
    dual_language_opt_in: false,
    secondary_locale: null as string | null,
    primary_billing_parent_locale: 'en',
  };

  it('opt_in=false → 1 emit (default)', () => {
    const out = fanoutNotification(baseNotification, baseHousehold, { defaultLocale: 'en' });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ locale: 'en', idempotency_key: 'evt-123-en' });
  });

  it('opt_in=true + secondary=null → 1 emit (default)', () => {
    const out = fanoutNotification(
      baseNotification,
      { ...baseHousehold, dual_language_opt_in: true },
      { defaultLocale: 'en' },
    );
    expect(out).toHaveLength(1);
    expect(out[0].locale).toBe('en');
  });

  it('opt_in=true + secondary=fr + default=en → 2 emits, en first', () => {
    const out = fanoutNotification(
      baseNotification,
      { ...baseHousehold, dual_language_opt_in: true, secondary_locale: 'fr' },
      { defaultLocale: 'en' },
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ locale: 'en', idempotency_key: 'evt-123-en' });
    expect(out[1]).toMatchObject({ locale: 'fr', idempotency_key: 'evt-123-fr' });
  });

  it('opt_in=true + secondary=en + default=en → 1 emit (no-op duplicate)', () => {
    const out = fanoutNotification(
      baseNotification,
      { ...baseHousehold, dual_language_opt_in: true, secondary_locale: 'en' },
      { defaultLocale: 'en' },
    );
    expect(out).toHaveLength(1);
    expect(out[0].locale).toBe('en');
  });

  it('idempotency key always carries the locale suffix', () => {
    const out = fanoutNotification(
      baseNotification,
      { ...baseHousehold, dual_language_opt_in: true, secondary_locale: 'ar' },
      { defaultLocale: 'en' },
    );
    expect(out.map((n) => n.idempotency_key)).toEqual(['evt-123-en', 'evt-123-ar']);
  });
});
```

- [ ] **Step 2.2 — Implement:**

```ts
// apps/worker/src/processors/communications/notification-fanout.ts

export type NotificationDraft = {
  template_key: string;
  channel: string;
  variables: Record<string, unknown>;
  idempotency_key: string;
};

export type HouseholdLocaleSnapshot = {
  id: string;
  tenant_id: string;
  dual_language_opt_in: boolean;
  secondary_locale: string | null;
  /** Locale already resolved for the primary billing parent (or whichever
   * recipient this notification targets). The dispatcher computes this from
   * household.preferred_locale → user.preferred_locale → tenant.default_locale. */
  primary_billing_parent_locale: string;
};

export type FanoutResult = NotificationDraft & { locale: string };

/**
 * Apply the dual-language fanout rule. Default-language emit ALWAYS comes
 * first; the secondary emit (if any) follows. Idempotency keys are suffixed
 * with the locale so dedupe doesn't collapse the pair.
 */
export function fanoutNotification(
  notification: NotificationDraft,
  household: HouseholdLocaleSnapshot,
  context: { defaultLocale: string },
): FanoutResult[] {
  const defaultLocale = household.primary_billing_parent_locale || context.defaultLocale;
  const result: FanoutResult[] = [
    {
      ...notification,
      locale: defaultLocale,
      idempotency_key: `${notification.idempotency_key}-${defaultLocale}`,
    },
  ];

  if (
    household.dual_language_opt_in &&
    household.secondary_locale !== null &&
    household.secondary_locale !== defaultLocale
  ) {
    result.push({
      ...notification,
      locale: household.secondary_locale,
      idempotency_key: `${notification.idempotency_key}-${household.secondary_locale}`,
    });
  }

  return result;
}
```

- [ ] **Step 2.3 — Run:** `pnpm --filter @school/worker test -- notification-fanout`

- [ ] **Step 2.4 — Commit:**

```bash
git add apps/worker/src/processors/communications/notification-fanout.ts apps/worker/src/processors/communications/notification-fanout.spec.ts
git commit -m "feat(worker): household-aware dual-language notification fanout"
```

### Task 3 — Wire fanout into the dispatch processor

**Files:**

- Modify: `apps/worker/src/processors/communications/dispatch-notifications.processor.ts`

- [ ] **Step 3.1 — Find the existing emit logic.** It currently builds one notification record per recipient.

- [ ] **Step 3.2 — Wrap recipient resolution** with `fanoutNotification(...)` for parent-bound notifications. Non-parent notifications skip fanout (single-emit).

```ts
// Before (sketch):
for (const recipient of recipients) {
  await emitNotification({
    ...draft,
    recipient_user_id: recipient.user_id,
    locale: recipient.locale,
  });
}

// After:
for (const recipient of recipients) {
  if (recipient.kind !== 'parent') {
    await emitNotification({
      ...draft,
      recipient_user_id: recipient.user_id,
      locale: recipient.locale,
    });
    continue;
  }
  const household = await loadHouseholdLocaleSnapshot(recipient.household_id);
  const fanned = fanoutNotification(draft, household, { defaultLocale: recipient.tenantDefault });
  for (const f of fanned) {
    await emitNotification({ ...f, recipient_user_id: recipient.user_id });
  }
}
```

- [ ] **Step 3.3 — Add the `loadHouseholdLocaleSnapshot()` helper** that reads the three columns from `households` + the resolved primary parent locale.

- [ ] **Step 3.4 — Test:** add or extend the processor `.spec.ts` to assert two emits when fanout fires.

- [ ] **Step 3.5 — Commit:**

```bash
git add apps/worker/src/processors/communications/dispatch-notifications.processor.ts
git commit -m "feat(worker): integrate fanout into dispatch processor for parent recipients"
```

### Task 4 — Frontend household locale-preferences card

**Files:**

- Create: `apps/web/src/app/[locale]/(school)/parent/household/_components/locale-preferences-card.tsx`
- Modify: `apps/web/src/app/[locale]/(school)/parent/household/page.tsx`

- [ ] **Step 4.1 — Build the card** with a switch and a dropdown:

```tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';

import { householdLocaleUpdateSchema, type HouseholdLocaleUpdate } from '@school/shared';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Button,
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
} from '@school/ui';

import { useTenantSupportedLocales } from '@/lib/use-tenant-supported-locales';
import { apiClient } from '@/lib/api-client';

type Props = {
  householdId: string;
  initial: { secondary_locale: string | null; dual_language_opt_in: boolean };
};

export function LocalePreferencesCard({ householdId, initial }: Props): React.ReactElement {
  const t = useTranslations('parent.household.locale_preferences');
  const { locales } = useTenantSupportedLocales();
  const form = useForm<HouseholdLocaleUpdate>({
    resolver: zodResolver(householdLocaleUpdateSchema),
    defaultValues: initial,
  });

  const onSubmit = async (data: HouseholdLocaleUpdate) => {
    try {
      await apiClient(`/v1/households/${householdId}/locale-preferences`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
      // Toast success
    } catch (err) {
      console.error('[LocalePreferencesCard]', err);
      // Toast error
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              name="dual_language_opt_in"
              control={form.control}
              render={({ field }) => (
                <FormItem className="flex items-center justify-between">
                  <FormLabel>{t('opt_in_label')}</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              name="secondary_locale"
              control={form.control}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('secondary_locale_label')}</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value ?? ''}
                      onValueChange={(v) => field.onChange(v === '' ? null : v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t('placeholder_none')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">{t('placeholder_none')}</SelectItem>
                        {locales.map((l) => (
                          <SelectItem key={l.code} value={l.code}>
                            {l.nativeName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                </FormItem>
              )}
            />
            <Button type="submit">{t('save')}</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4.2 — Add translation keys** to `en.json` and `ar.json` in the same commit:

```json
{
  "parent": {
    "household": {
      "locale_preferences": {
        "title": "Communication languages",
        "opt_in_label": "Send communications in two languages",
        "secondary_locale_label": "Second language",
        "placeholder_none": "Choose…",
        "save": "Save"
      }
    }
  }
}
```

(Translate to AR.)

- [ ] **Step 4.3 — Wire into the household page** (`page.tsx`).

- [ ] **Step 4.4 — Commit:**

```bash
git add apps/web/src/app/[locale]/\(school\)/parent/household/ apps/web/messages/en.json apps/web/messages/ar.json
git commit -m "feat(web): household locale preferences card (opt-in + secondary)"
```

### Task 5 — Integration + Playwright tests

**Files:**

- Create: `apps/worker/src/processors/communications/dispatch-fanout.integration-spec.ts`
- Create: `apps/web/e2e/dual-language-household.spec.ts`

- [ ] **Step 5.1 — Integration test:** create a test tenant with `supported_locales = ['en','ar']` (we don't have other catalogues yet), a test household with `dual_language_opt_in=true` and `secondary_locale='ar'`, and `primary_billing_parent_locale='en'`. Trigger a `payment_received` notification through the actual dispatch entry point. Assert two rows in `notifications` table — one en, one ar.

- [ ] **Step 5.2 — Playwright test:** parent logs in, navigates to `/en/parent/household`, opens locale preferences card, toggles opt-in, picks Arabic as secondary, saves, reloads — values persist.

- [ ] **Step 5.3 — Run both:**

```bash
pnpm --filter @school/worker test -- dispatch-fanout
pnpm --filter @school/web exec playwright test --grep dual-language-household
```

- [ ] **Step 5.4 — Commit:**

```bash
git add apps/worker/src/processors/communications/dispatch-fanout.integration-spec.ts apps/web/e2e/dual-language-household.spec.ts
git commit -m "test: integration + Playwright coverage for dual-language fanout"
```

### Task 6 — Architecture docs

**Files:**

- Modify: `docs/architecture/event-job-catalog.md`
- Modify: `docs/architecture/state-machines.md`
- Modify: `docs/architecture/danger-zones.md`

- [ ] **Step 6.1 — Document the fanout rule** in `event-job-catalog.md` with the truth table.
- [ ] **Step 6.2 — Add the household opt-in field-state** to `state-machines.md` (it's a 2-bool combinatorial; document the four states explicitly).
- [ ] **Step 6.3 — Add a danger-zone entry**: "Idempotency keys MUST suffix the locale code on dual-language emits — anyone changing dispatch dedupe must preserve this or the second emit gets silently dropped."
- [ ] **Step 6.4 — Commit.**

### Task 7 — Push, deploy, verify

- [ ] **Step 7.1 — Local sweep + branch state.**
- [ ] **Step 7.2 — `git push origin main && gh run watch`.**
- [ ] **Step 7.3 — Production verification on NHQS:**
  - Log in as a parent with a household. Open household profile. Toggle opt-in. Pick AR as secondary. Save.
  - Trigger a payment — verify two `notifications` rows in the DB (one en, one ar) and that the user receives both in-app + via email.
  - Open Sentry — no `MISSING_NOTIFICATION_MESSAGE` exceptions.

- [ ] **Step 7.4 — Append completion entry to `IMPLEMENTATION_LOG.md`.**

---

## Acceptance criteria

- [ ] `PATCH /v1/households/:id/locale-preferences` exists and validates against tenant `supported_locales`
- [ ] `LocalePreferencesCard` renders, persists, surfaces errors
- [ ] `fanoutNotification()` produces correct emit sets for all four permutations
- [ ] Dispatch processor calls fanout for parent-bound notifications
- [ ] Idempotency keys suffix the locale
- [ ] Audit log shows both emits with locale tags
- [ ] Integration test: real dispatch produces exactly two rows
- [ ] Playwright: parent flow persists preferences across reloads
- [ ] CI green; production deploy successful
- [ ] Live verification on NHQS: dual-language opt-in produces two notifications
- [ ] `IMPLEMENTATION_LOG.md` updated

---

## Verification commands

```bash
turbo lint && turbo type-check && turbo test
pnpm --filter @school/worker test -- notification-fanout dispatch-fanout
pnpm --filter @school/web exec playwright test --grep dual-language-household

# Post-deploy: opt-in a test household, trigger payment, then:
ssh root@46.62.244.139 "sudo -u edupod psql edupod_prod -c \"
  SELECT recipient_user_id, locale, idempotency_key, channel
  FROM notifications
  WHERE created_at > now() - interval '5 minutes'
  ORDER BY created_at DESC LIMIT 10;
\""
```

---

## Rollback

```bash
# Revert all commits in this implementation
git revert <last-sha>..<first-sha>
git push origin main
# CI redeploys. The fanout reverts to single-emit. Households that already
# saved opt_in=true keep the column value (no schema change), but it's a
# no-op until fanout is re-shipped.
```

---

## Notes for the executor

- The `primary_billing_parent_locale` field on `HouseholdLocaleSnapshot` is computed at dispatch time, not stored. Compose it from the existing locale resolution chain (household preferred → user preferred → tenant default).
- Do NOT introduce a new permission for the household endpoint. `household.manage_own` already exists and covers parent self-edit.
- Until Phase 4/5 ships any new active locales, the only valid `secondary_locale` values are `en` and `ar`. The opt-in toggle is functional today (en/ar dual-emit works), but the use case lights up properly only after at least one Phase 4/5 implementation lands.
- Idempotency suffix MUST come AFTER any other suffix the existing dedupe scheme uses. Inspect the current key format and append `-{locale}` at the very end.
