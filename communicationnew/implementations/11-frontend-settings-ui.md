# Implementation 11 — Frontend Settings UI

> **Wave:** 4
> **Depends on:** 03 (services + controllers + Zod schemas + masked DTOs), 07 (email-domain endpoints + DNS records shape), 08 (whatsapp-template endpoints + service-window status), 09 (test-send endpoints + verbatim error surface)
> **Restart:** web only (`pm2 restart web` is N/A in worktree mode — locally `pnpm --filter @school/web dev` hot-reloads)
> **Deployment route:** worktree commit only (per IMPLEMENTATION_LOG.md Rule 5) — NO CI, NO PRODUCTION

---

## Goal

Build the four settings pages described in `docs/architecture/communication-architecture.md` §3.11, all rooted under `apps/web/src/app/[locale]/(school)/settings/communications/`. The shape mirrors the existing `(school)/settings/stripe/page.tsx` pattern — a single configuration form per resource with a masked-on-read / re-enter-to-update credential UX, plus the operational surfaces unique to each channel.

This is the only frontend that ships in this rebuild. Every other implementation is backend or worker. The pages are gated behind `configuration.communications.manage` (role-mapped to Owner / Principal / Vice Principal in Impl 02). Backend re-checks the permission via `@RequiresPermission` on every controller from Impl 03 / 07 / 08 / 09, so the frontend gate is purely UX — a friendly "you don't have permission" surface instead of a 403 toast on every load.

The four pages are:

1. **Index** at `/settings/communications` — three status cards, one per channel.
2. **Email** at `/settings/communications/email` — Resend config + domain verification card + test send.
3. **SMS** at `/settings/communications/sms` — Twilio SMS config + test send.
4. **WhatsApp** at `/settings/communications/whatsapp` — Twilio WhatsApp config + template list + template submit form + test send (template-gated).

Every form uses `react-hook-form` + `zodResolver` against the Impl 03 Zod schemas (`upsertEmailConfigSchema`, `upsertSmsConfigSchema`, `upsertWhatsAppConfigSchema`, `testEmailSchema`, `testSmsSchema`, `testWhatsAppSchema`). Every field that holds a secret renders as `type="password"` with a `Show` toggle, and saved values are returned masked (`••••••••last4`) — the user must re-enter to update. EN + AR translations live under `settings.communications.*` in `messages/en.json` and `messages/ar.json`. Logical CSS only (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`); zero `ml-` / `mr-` / `pl-` / `pr-` / `left-` / `right-`. Responsive at 375 px (single-column stack); two-column inputs at `md:` and above.

From this implementation onward, **Playwright verification on `http://localhost:5551` is mandatory** (per IMPLEMENTATION_LOG.md Rule 27a). The §Verification block below scripts the walk explicitly.

---

## What to change

### 1. Index page — `apps/web/src/app/[locale]/(school)/settings/communications/page.tsx` (NEW)

Top-level overview of all three channels. One card per channel, three cards in a responsive grid: 3-column at `lg:` and above, single-column stack on mobile.

**Layout:**

```
<div className="flex min-w-0 flex-col gap-8 pb-10">
  <PageHeader title={t('title')} description={t('subtitle')} />
  <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
    <ChannelCard channel="email" status={emailStatus} ... />
    <ChannelCard channel="sms" status={smsStatus} ... />
    <ChannelCard channel="whatsapp" status={whatsappStatus} ... />
  </div>
</div>
```

`PageHeader` — reuse the existing component at `apps/web/src/components/page-header.tsx` (the same one used by `fallback/page.tsx` and most other settings pages).

**Data fetching.** A single `useEffect` runs once on mount. Three parallel `apiClient` calls via `Promise.allSettled` so that one channel's 404 doesn't fail the others:

```typescript
React.useEffect(() => {
  let cancelled = false;
  (async () => {
    const [email, sms, whatsapp] = await Promise.allSettled([
      apiClient<MaskedEmailConfig | { data: MaskedEmailConfig }>('/api/v1/email-config'),
      apiClient<MaskedSmsConfig | { data: MaskedSmsConfig }>('/api/v1/sms-config'),
      apiClient<MaskedWhatsAppConfig | { data: MaskedWhatsAppConfig }>('/api/v1/whatsapp-config'),
    ]);
    if (cancelled) return;
    setEmailStatus(toStatus(email));
    setSmsStatus(toStatus(sms));
    setWhatsAppStatus(toStatus(whatsapp));
    setIsLoading(false);
  })();
  return () => {
    cancelled = true;
  };
}, []);
```

`toStatus` collapses each settled result to one of:

```typescript
type ChannelStatus =
  | { kind: 'configured'; lastVerifiedAt: Date | null; isEnabled: boolean }
  | { kind: 'verification_failed'; lastVerifiedAt: Date | null }
  | { kind: 'disabled'; lastVerifiedAt: Date | null }
  | { kind: 'not_configured' };
```

Mapping rules (deterministic, no network shape guesswork):

- `Promise.allSettled` → `rejected` AND the rejection's `error.code === 'NOT_CONFIGURED'` (the controllers from Impl 03 throw `NotFoundException({ code: 'NOT_CONFIGURED', ... })` when no row exists) → `not_configured`.
- `fulfilled` AND `is_enabled === true` AND `last_verified_at !== null` → `configured`.
- `fulfilled` AND `is_enabled === true` AND `last_verified_at === null` → `verification_failed` (row exists but the user never ran a successful test send — UI nudge to "verify now").
- `fulfilled` AND `is_enabled === false` → `disabled`.
- Any other rejection (network, 500) → log and treat as `not_configured` for display, but show a non-blocking toast `t('errors.loadFailed')`.

**`ChannelCard` component (inline in the page file, ~80 lines).** Props: `{ channel: 'email' | 'sms' | 'whatsapp'; status: ChannelStatus; locale: string }`. Renders:

```
┌────────────────────────────────────────┐
│ <Icon> Channel name           [badge]  │
│         via Provider                   │
│                                        │
│ Status indicator  ●  Configured        │
│ Last verified: 2 hours ago             │
│                                        │
│ [ Configure / Update button → ]        │
└────────────────────────────────────────┘
```

Status indicator colour map (token-driven, never a hex literal):

| Status              | Icon            | Colour token                                  | Label key                                           |
| ------------------- | --------------- | --------------------------------------------- | --------------------------------------------------- |
| configured          | `CheckCircle2`  | `text-success` + `bg-success-100`             | `settings.communications.status.configured`         |
| not_configured      | `Circle`        | `text-text-tertiary` + `bg-surface-secondary` | `settings.communications.status.notConfigured`      |
| verification_failed | `AlertTriangle` | `text-warning` + `bg-warning-100`             | `settings.communications.status.verificationFailed` |
| disabled            | `MinusCircle`   | `text-text-tertiary` + `bg-surface-secondary` | `settings.communications.status.disabled`           |

Last-verified timestamp formatted as a relative string via `Intl.RelativeTimeFormat`:

```typescript
function formatLastVerified(lastVerifiedAt: Date | null, locale: string, t: TFunc): string {
  if (!lastVerifiedAt) return t('lastVerified.never');
  const diffMs = Date.now() - new Date(lastVerifiedAt).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return t('lastVerified.justNow');
  if (diffMin < 60) return t('lastVerified.minutesAgo', { n: diffMin });
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t('lastVerified.hoursAgo', { n: diffHr });
  const diffDays = Math.floor(diffHr / 24);
  return t('lastVerified.daysAgo', { n: diffDays });
}
```

The CTA button label depends on status:

- `not_configured` → `t('actions.configure')`, links to `/{locale}/settings/communications/{channel}` with `<ArrowRight className="rtl:rotate-180" />`.
- All other statuses → `t('actions.update')`, same destination.

**Permission gate.** Use the role check pattern already in the codebase. Adopt `useRoleCheck()` from `@/hooks/use-role-check` with `ADMIN_ROLES`. If the user lacks every admin role, render `<NoPermissionState />` (a small inline component — heading + paragraph + back-to-settings link) instead of the cards. The backend re-enforces via Impl 03's `@RequiresPermission('configuration.communications.manage')` so this is purely UX.

```typescript
const { hasAnyRole } = useRoleCheck();
const canManage = hasAnyRole('school_owner', 'school_principal', 'school_vice_principal');
if (!canManage) return <NoPermissionState />;
```

**Loading state.** While `isLoading`, render three skeleton cards (`<div className="h-40 animate-pulse rounded-2xl border border-border bg-surface-secondary" />`). Skeleton count matches the production card count to avoid layout shift.

**Skeleton container width.** The page wrapper uses `min-w-0` on the flex column — this is required by `frontend.md` for morph-shell layouts to prevent horizontal overflow on mobile.

---

### 2. Email config page — `apps/web/src/app/[locale]/(school)/settings/communications/email/page.tsx` (NEW)

Three sections stacked vertically:

1. **Credential form** — load + save the Resend config.
2. **Test send card** — recipient input + button + result panel.
3. **Domain verification card** — list domains + register new + view DNS + refresh + delete.

#### 2.1 Credential form

`react-hook-form` + `zodResolver(upsertEmailConfigSchema)` from `@school/shared`:

```typescript
import { upsertEmailConfigSchema } from '@school/shared';
import type { UpsertEmailConfigDto, MaskedEmailConfig } from '@school/shared';

const form = useForm<UpsertEmailConfigDto>({
  resolver: zodResolver(upsertEmailConfigSchema),
  defaultValues: {
    resend_api_key: '',
    from_email: '',
    from_name: '',
    reply_to_email: '',
    webhook_secret: '',
  },
});
```

Fields rendered (single-column on mobile, two-column at `md:` for the four short fields, full-width for `from_name` if multi-line):

| Field            | Input type | Placeholder              | helpText (translated)                                                      |
| ---------------- | ---------- | ------------------------ | -------------------------------------------------------------------------- |
| `resend_api_key` | password   | `re_xxxxxxxxxxxx`        | "Get this from your Resend dashboard → API keys."                          |
| `from_email`     | email      | `noreply@school.example` | "The address parents see in the inbox."                                    |
| `from_name`      | text       | `St. Mary's Academy`     | "Display name shown in the inbox (optional)."                              |
| `reply_to_email` | email      | `office@school.example`  | "Where parents' replies go (defaults to from_email)."                      |
| `webhook_secret` | password   | `whsec_xxxxxxxx`         | "Used to verify Resend → EduPod callbacks. Set this in Resend → Webhooks." |

Reuse the `PasswordInput` component from `(school)/settings/stripe/page.tsx`. Hoist it into a shared place to avoid duplication: create `apps/web/src/app/[locale]/(school)/settings/communications/_components/password-input.tsx` (NEW) with the exact same body, and import it in stripe and all three communications pages. (This avoids drift if one page's eye-toggle changes.) Keep stripe's import flipped to the new path in the same commit so the file moves cleanly.

```typescript
// apps/web/src/app/[locale]/(school)/settings/communications/_components/password-input.tsx
'use client';

import { Eye, EyeOff } from 'lucide-react';
import * as React from 'react';

import { Input } from '@school/ui';

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  disabled,
  showLabel,
  hideLabel,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  showLabel: string;
  hideLabel: string;
}) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="pe-10 font-mono text-base"
        autoComplete="off"
        spellCheck={false}
        dir="ltr"
      />
      <button
        type="button"
        className="absolute end-3 top-1/2 -translate-y-1/2 text-text-tertiary transition-colors hover:text-text-secondary"
        onClick={() => setVisible((v) => !v)}
        tabIndex={-1}
        aria-label={visible ? hideLabel : showLabel}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
```

Two notes on this hoisted component:

- `dir="ltr"` is forced on the `Input` because API keys / webhook secrets are LTR codes — never let RTL flip them. Same rule applies to `from_email` (also `dir="ltr"`).
- The `text-base` class is mandatory to prevent iOS Safari auto-zoom on focus (`frontend.md` §Forms & Inputs).

**Initial load.** On mount, `apiClient<MaskedEmailConfig | { data: MaskedEmailConfig }>('/api/v1/email-config')`. On success → `setIsConfigured(true)`, store the masked values in component state (separate from the form, since the form holds pending changes only), and show the read-only summary panel. On 404 with `code: 'NOT_CONFIGURED'` → `setIsConfigured(false)`, switch to edit mode.

**Save handler.**

```typescript
const onSubmit = async (values: UpsertEmailConfigDto) => {
  try {
    const raw = await apiClient<MaskedEmailConfig | { data: MaskedEmailConfig }>(
      '/api/v1/email-config',
      {
        method: 'PUT',
        body: JSON.stringify(values),
      },
    );
    const config = unwrap<MaskedEmailConfig>(raw);
    setMasked(config);
    setIsConfigured(true);
    setIsEditing(false);
    form.reset(); // clear plaintext entry boxes
    toast.success(t('save.success'));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : t('save.error');
    toast.error(message);
  }
};
```

The save button is disabled while `form.formState.isSubmitting`.

**Read-only configured summary panel.** When `isConfigured === true && !isEditing`, render the masked values in a card (mirroring `stripe/page.tsx`):

```
┌──────────────────────────────────────────────┐
│ Resend                                       │
│ Configured  ✓                          ●     │
│                                              │
│ API key:        ••••••••2af3                 │
│ From:           noreply@school.example       │
│ Reply-to:       office@school.example        │
│ Webhook secret: ••••••••f1d8                 │
│ Last rotated:   2 days ago                   │
│                                              │
│ [ Update ]                                   │
└──────────────────────────────────────────────┘
```

`key_last_rotated_at` is rendered if non-null (relative format same as the index card).

**Delete configuration action** (red, at the bottom of the read-only summary panel — never visible while editing):

```typescript
async function handleDelete() {
  if (!window.confirm(t('delete.confirm'))) return;
  try {
    await apiClient('/api/v1/email-config', { method: 'DELETE' });
    setMasked(null);
    setIsConfigured(false);
    setIsEditing(true);
    toast.success(t('delete.success'));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : t('delete.error');
    toast.error(message);
  }
}
```

The browser-native `confirm` is sufficient — no modal infrastructure exists in the codebase for destructive confirms today, and adding one is out of scope. (The text inside `t('delete.confirm')` is bilingual so the modal localises naturally.)

#### 2.2 Test-send card

Below the credential form (or below the read-only summary), a separate card. Active only when `isConfigured && !isEditing`.

```typescript
const testForm = useForm<TestEmailDto>({
  resolver: zodResolver(testEmailSchema),
  defaultValues: { recipient_email: '' },
});
const [testResult, setTestResult] = React.useState<TestResult | null>(null);

type TestResult =
  | { kind: 'success'; sentAt: Date }
  | { kind: 'failure'; providerError: string; hint?: string }
  | { kind: 'rate_limited'; retryAfterMin: number };

const onTest = async ({ recipient_email }: TestEmailDto) => {
  setTestResult(null);
  try {
    await apiClient('/api/v1/email-config/test', {
      method: 'POST',
      body: JSON.stringify({ recipient_email }),
      silent: true, // we render the error verbatim, suppress global toast
    });
    setTestResult({ kind: 'success', sentAt: new Date() });
  } catch (err: unknown) {
    const errorObj = err as {
      error?: {
        code?: string;
        message?: string;
        details?: { provider_error?: string; retry_after_min?: number };
      };
    };
    const code = errorObj?.error?.code;
    if (code === 'RATE_LIMITED') {
      setTestResult({
        kind: 'rate_limited',
        retryAfterMin: errorObj?.error?.details?.retry_after_min ?? 60,
      });
    } else {
      setTestResult({
        kind: 'failure',
        providerError:
          errorObj?.error?.details?.provider_error ?? errorObj?.error?.message ?? t('test.error'),
        hint: t(`test.hints.${code}`, { defaultValue: '' }),
      });
    }
  }
};
```

Render result panel inline (no toast — verbatim provider errors deserve a visible, copyable surface):

- **Success** — green banner: "Test email sent. Check your inbox (allow 1–2 minutes)." Plus the recipient address in monospace.
- **Failure** — red banner with the verbatim provider error (`<pre className="font-mono text-xs whitespace-pre-wrap">{providerError}</pre>`) and an optional troubleshooting hint translated under `settings.communications.email.test.hints.{code}` (e.g. `INVALID_API_KEY` → "Verify the API key on resend.com/api-keys"; `DOMAIN_NOT_VERIFIED` → "Register the sending domain below before testing."). Hints are best-effort — if no key matches, the hint is empty.
- **Rate limited** — amber banner: "Test sends are limited to 3 per hour per tenant. Try again in {n} minutes." (Impl 09 enforces this on a separate Redis bucket.)

The "Send test message" button is disabled while `testForm.formState.isSubmitting`. The recipient input is `text-base` and `dir="ltr"`.

#### 2.3 Domain verification card — `_components/domain-verification-card.tsx` (NEW)

The third section on the email page. Self-contained component that owns its own data fetching against `/api/v1/email-domains` (Impl 07). Render only when `isConfigured` — registering a domain requires a Resend API key.

```typescript
// apps/web/src/app/[locale]/(school)/settings/communications/email/_components/domain-verification-card.tsx
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button, Input, Label, toast } from '@school/ui';

import { apiClient, unwrap } from '@/lib/api-client';

import { DnsRecordsTable } from './dns-records-table';

const addDomainSchema = z.object({
  domain: z
    .string()
    .min(3)
    .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, 'Enter a valid domain (e.g. school.example)'),
});
type AddDomainForm = z.infer<typeof addDomainSchema>;

interface DomainRow {
  id: string;
  domain: string;
  status: 'pending' | 'verified' | 'failed';
  records: Array<{ record_type: 'SPF' | 'DKIM' | 'DMARC'; name: string; value: string; status: 'pending' | 'verified' | 'failed' }>;
  last_checked_at: string | null;
  verified_at: string | null;
  created_at: string;
}

export function DomainVerificationCard() {
  const t = useTranslations('settings.communications.email.domains');
  const [rows, setRows] = React.useState<DomainRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [refreshingId, setRefreshingId] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [showAdd, setShowAdd] = React.useState(false);

  const form = useForm<AddDomainForm>({
    resolver: zodResolver(addDomainSchema),
    defaultValues: { domain: '' },
  });

  const load = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const raw = await apiClient<{ data: DomainRow[] } | DomainRow[]>('/api/v1/email-domains');
      setRows(unwrap<DomainRow[]>(raw));
    } catch (err) {
      console.error('[DomainVerificationCard.load]', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const onAdd = async (values: AddDomainForm) => {
    try {
      await apiClient('/api/v1/email-domains', { method: 'POST', body: JSON.stringify(values) });
      toast.success(t('add.success'));
      form.reset();
      setShowAdd(false);
      await load();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('add.error');
      toast.error(message);
    }
  };

  const onRefresh = async (id: string) => {
    setRefreshingId(id);
    try {
      const raw = await apiClient<{ data: DomainRow } | DomainRow>(`/api/v1/email-domains/${id}/refresh`, {
        method: 'POST',
      });
      const updated = unwrap<DomainRow>(raw);
      setRows((rs) => rs.map((r) => (r.id === id ? updated : r)));
      toast.success(t('refresh.success'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('refresh.error');
      toast.error(message);
    } finally {
      setRefreshingId(null);
    }
  };

  const onDelete = async (id: string, domain: string) => {
    if (!window.confirm(t('delete.confirm', { domain }))) return;
    try {
      await apiClient(`/api/v1/email-domains/${id}`, { method: 'DELETE' });
      setRows((rs) => rs.filter((r) => r.id !== id));
      toast.success(t('delete.success'));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('delete.error');
      toast.error(message);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-text-primary">{t('title')}</h2>
          <p className="mt-0.5 text-sm text-text-secondary">{t('description')}</p>
        </div>
        <Button type="button" size="sm" onClick={() => setShowAdd((s) => !s)}>
          {showAdd ? t('add.cancel') : t('add.button')}
        </Button>
      </header>

      {showAdd && (
        <form onSubmit={form.handleSubmit(onAdd)} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="domain-input">{t('add.domainLabel')}</Label>
            <Input
              id="domain-input"
              type="text"
              dir="ltr"
              placeholder={t('add.domainPlaceholder')}
              className="mt-1 font-mono text-base"
              {...form.register('domain')}
            />
            {form.formState.errors.domain && (
              <p className="mt-1 text-xs text-destructive">{form.formState.errors.domain.message}</p>
            )}
          </div>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t('add.submitting') : t('add.submit')}
          </Button>
        </form>
      )}

      <div className="mt-6 space-y-3">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-text-tertiary">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('loading')}
          </div>
        )}
        {!isLoading && rows.length === 0 && (
          <p className="text-sm text-text-tertiary">{t('empty')}</p>
        )}
        {!isLoading &&
          rows.map((row) => (
            <DomainRowCard
              key={row.id}
              row={row}
              expanded={expandedId === row.id}
              onToggle={() => setExpandedId((id) => (id === row.id ? null : row.id))}
              onRefresh={() => onRefresh(row.id)}
              onDelete={() => onDelete(row.id, row.domain)}
              refreshing={refreshingId === row.id}
            />
          ))}
      </div>
    </section>
  );
}

function DomainRowCard({
  row,
  expanded,
  onToggle,
  onRefresh,
  onDelete,
  refreshing,
}: {
  row: DomainRow;
  expanded: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  refreshing: boolean;
}) {
  const t = useTranslations('settings.communications.email.domains');
  return (
    <div className="rounded-xl border border-border bg-surface-secondary p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm text-text-primary" dir="ltr">{row.domain}</p>
          <p className="mt-0.5 text-xs text-text-tertiary">{t('lastChecked', { ts: formatTs(row.last_checked_at) })}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={row.status} />
          <Button type="button" size="sm" variant="outline" onClick={onToggle}>
            {expanded ? t('hideRecords') : t('viewRecords')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw className={`me-2 h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {t('refresh.button')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onDelete}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="me-2 h-3.5 w-3.5" />
            {t('delete.button')}
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="mt-4 border-t border-border pt-4">
          <DnsRecordsTable records={row.records} />
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: DomainRow['status'] }) {
  const t = useTranslations('settings.communications.email.domains.status');
  const map: Record<DomainRow['status'], { label: string; className: string }> = {
    pending: { label: t('pending'), className: 'bg-warning-100 text-warning-700' },
    verified: { label: t('verified'), className: 'bg-success-100 text-success-700' },
    failed: { label: t('failed'), className: 'bg-destructive/10 text-destructive' },
  };
  const item = map[status];
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${item.className}`}>
      {item.label}
    </span>
  );
}

function formatTs(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}
```

#### 2.4 DNS records table — `_components/dns-records-table.tsx` (NEW)

A small presentational sub-component used inside the expander. Renders SPF / DKIM / DMARC rows with `name` / `type` / `value` columns and an explicit per-record status pill. Each `value` cell is force-LTR + monospaced so DKIM blobs display correctly in RTL locales.

```typescript
// apps/web/src/app/[locale]/(school)/settings/communications/email/_components/dns-records-table.tsx
'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, toast } from '@school/ui';

interface DnsRecord {
  record_type: 'SPF' | 'DKIM' | 'DMARC';
  name: string;
  value: string;
  status: 'pending' | 'verified' | 'failed';
}

export function DnsRecordsTable({ records }: { records: DnsRecord[] }) {
  const t = useTranslations('settings.communications.email.domains.dns');

  const onCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('copy.success'));
    } catch (err) {
      console.error('[DnsRecordsTable.onCopy]', err);
      toast.error(t('copy.error'));
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px] text-start text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-text-tertiary">
            <th className="pb-2 ps-0 pe-3 text-start font-medium">{t('headers.type')}</th>
            <th className="pb-2 pe-3 text-start font-medium">{t('headers.name')}</th>
            <th className="pb-2 pe-3 text-start font-medium">{t('headers.value')}</th>
            <th className="pb-2 pe-3 text-start font-medium">{t('headers.status')}</th>
            <th className="pb-2 pe-0 text-start font-medium" />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={`${r.record_type}-${r.name}`} className="border-b border-border last:border-b-0">
              <td className="py-3 pe-3 font-mono text-xs">{r.record_type}</td>
              <td className="py-3 pe-3 font-mono text-xs" dir="ltr">{r.name}</td>
              <td className="py-3 pe-3">
                <code className="block max-w-[280px] truncate font-mono text-xs" dir="ltr" title={r.value}>
                  {r.value}
                </code>
              </td>
              <td className="py-3 pe-3">
                <span className={`text-xs font-medium ${r.status === 'verified' ? 'text-success' : r.status === 'failed' ? 'text-destructive' : 'text-warning'}`}>
                  {t(`status.${r.status}`)}
                </span>
              </td>
              <td className="py-3 pe-0">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onCopy(r.value)}
                  aria-label={t('copy.aria')}
                >
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

The table is wrapped in `<div className="overflow-x-auto">` per `frontend.md` §Tables. The `min-w-[500px]` ensures DNS values don't truncate to nothing on narrow viewports.

---

### 3. SMS config page — `apps/web/src/app/[locale]/(school)/settings/communications/sms/page.tsx` (NEW)

Structurally identical to the email page minus the domain card. Two sections:

1. Credential form (form mirrors email, schema is `upsertSmsConfigSchema`).
2. Test-send card (`testSmsSchema` recipient phone).

Fields:

| Field                | Input type | Placeholder      | helpText                                                   |
| -------------------- | ---------- | ---------------- | ---------------------------------------------------------- |
| `twilio_account_sid` | password   | `ACxxxxxxxxxxxx` | "From your Twilio console → Account info."                 |
| `twilio_auth_token`  | password   | `xxxxxxxxxxxx`   | "Your Twilio auth token. Treat as a password."             |
| `twilio_from_number` | text       | `+44XXXXXXXXX`   | "E.164 format. The number Twilio assigned to this tenant." |
| `webhook_secret`     | password   | `whsec_xxxx`     | "Used to verify Twilio → EduPod callbacks."                |

The `twilio_from_number` field: `text-base`, `dir="ltr"`, `inputMode="tel"` so mobile keyboards open the numeric pad. Phone numbers are LTR even in Arabic — wrap their values in `<span dir="ltr">` when rendering masked output (the `MaskedSmsConfig` shape includes `twilio_from_number` non-masked).

Test send sends a fixed sentinel template via Impl 09's `POST /v1/sms-config/test` with `{ recipient_phone }`. Result panel mirrors email exactly — success / failure (verbatim provider error) / rate-limited.

Read-only summary panel and delete handler mirror email. The masked summary lists:

- `twilio_account_sid_mask`
- `twilio_auth_token_mask`
- `twilio_from_number` (full, not masked)
- `webhook_secret_mask`
- `key_last_rotated_at`

---

### 4. WhatsApp config page — `apps/web/src/app/[locale]/(school)/settings/communications/whatsapp/page.tsx` (NEW)

Three sections:

1. Credential form (`upsertWhatsAppConfigSchema`).
2. Test-send card (`testWhatsAppSchema` — recipient phone + template_key dropdown).
3. **Template list section** + **Template submission form**.

#### 4.1 Credential form

Fields:

| Field                         | Input type | Placeholder      | helpText                                                                   |
| ----------------------------- | ---------- | ---------------- | -------------------------------------------------------------------------- |
| `twilio_account_sid`          | password   | `ACxxxxxxxxxxxx` | "From your Twilio console → Account info."                                 |
| `twilio_auth_token`           | password   | `xxxxxxxxxxxx`   | "Your Twilio auth token."                                                  |
| `twilio_whatsapp_from_number` | text       | `+44XXXXXXXXX`   | "E.164 format. The WhatsApp business number registered with Twilio."       |
| `business_profile_id`         | text       | `BPxxxxxxxxxxxx` | "Optional. Required only if your account uses multiple business profiles." |
| `webhook_secret`              | password   | `whsec_xxxx`     | "Used to verify Twilio → EduPod callbacks."                                |

Read-only summary panel structure and delete handler: same as email/SMS.

#### 4.2 Test-send card

Test send needs both a recipient phone and a template_key (per `testWhatsAppSchema`). The template dropdown lists only `approved` templates returned from `GET /v1/whatsapp-templates?status=approved`. If there are zero approved templates, the test-send card renders a banner: "No approved WhatsApp templates yet — submit one below before testing." The "Send test" button is disabled in that case.

```typescript
const testForm = useForm<TestWhatsAppDto>({
  resolver: zodResolver(testWhatsAppSchema),
  defaultValues: { recipient_phone: '', template_key: '' },
});

const [approvedTemplates, setApprovedTemplates] = React.useState<TemplateRow[]>([]);
React.useEffect(() => {
  void (async () => {
    try {
      const raw = await apiClient<{ data: TemplateRow[] } | TemplateRow[]>(
        '/api/v1/whatsapp-templates?status=approved',
      );
      setApprovedTemplates(unwrap<TemplateRow[]>(raw));
    } catch (err) {
      console.error('[WhatsAppPage.loadTemplates]', err);
    }
  })();
}, []);
```

Render a `<Select>` from `@school/ui` populated with `approvedTemplates.map(t => ({ value: t.template_key, label: `${t.template_key} (${t.language_code})` }))`. The recipient_phone input mirrors the SMS one (LTR, `text-base`, `inputMode="tel"`).

#### 4.3 Template list — `_components/template-list.tsx` (NEW)

Self-fetching component. On mount calls `GET /v1/whatsapp-templates`. Renders a list of cards, one per template, with status badges and per-row actions.

**Row shape (returned from Impl 08):**

```typescript
interface TemplateRow {
  id: string;
  template_key: string;
  language_code: string; // e.g. 'en' or 'ar'
  category: 'transactional' | 'marketing' | 'authentication' | 'utility';
  body: string;
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'paused';
  twilio_template_sid: string | null;
  rejected_reason: string | null;
  approved_at: string | null;
  created_at: string;
}
```

**Per-row layout:**

```
┌──────────────────────────────────────────────────────┐
│ [template_key]                       [status badge]  │
│ Language: en    Category: transactional              │
│ Approved: 3 days ago                                 │
│                                                      │
│ ▸ Show body                                          │
│   (expands to show body text in monospace)           │
│                                                      │
│ Actions per status:                                  │
│  pending   → [ Submit to Twilio ] [ Delete ]         │
│  submitted → [ Sync status ] [ Delete ]              │
│  approved  → [ Pause ] [ Delete ]                    │
│  paused    → [ Resume ] [ Delete ]                   │
│  rejected  → [ Show reason ] [ Delete ]              │
└──────────────────────────────────────────────────────┘
```

**Action API mapping** (endpoints from Impl 08):

| Action           | Method + Path                                | Effect                                                               |
| ---------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Submit to Twilio | `POST /api/v1/whatsapp-templates/:id/submit` | Worker submits to Twilio's content API; status flips to `submitted`. |
| Sync status      | `POST /api/v1/whatsapp-templates/:id/sync`   | Server polls Twilio immediately; updates `status`.                   |
| Pause            | `POST /api/v1/whatsapp-templates/:id/pause`  | `status='paused'`.                                                   |
| Resume           | `POST /api/v1/whatsapp-templates/:id/resume` | `status='approved'`.                                                 |
| Delete           | `DELETE /api/v1/whatsapp-templates/:id`      | Deletes the row (after confirm).                                     |

Status badge colours:

| status    | colour token                               |
| --------- | ------------------------------------------ |
| pending   | `bg-surface-secondary text-text-secondary` |
| submitted | `bg-info-100 text-info-700`                |
| approved  | `bg-success-100 text-success-700`          |
| rejected  | `bg-destructive/10 text-destructive`       |
| paused    | `bg-warning-100 text-warning-700`          |

`rejected` status row also shows the `rejected_reason` inline (if non-null) in red.

Each action wraps its API call in a try/catch with a toast and refetches the list on success. The "Sync status" button surfaces a "Synced — status: {status}" toast on success, even if the status didn't change, so the user gets explicit feedback.

```typescript
// _components/template-list.tsx (sketch — full file is ~200 lines)
async function performAction(id: string, action: 'submit' | 'sync' | 'pause' | 'resume') {
  const path = `/api/v1/whatsapp-templates/${id}/${action}`;
  try {
    await apiClient(path, { method: 'POST' });
    await reload();
    toast.success(t(`actions.${action}.success`));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : t(`actions.${action}.error`);
    toast.error(message);
  }
}
```

#### 4.4 Template submission form — `_components/template-submit-form.tsx` (NEW)

react-hook-form with a form-local Zod schema that mirrors Impl 08's `createTemplateSchema`:

```typescript
const submitTemplateSchema = z.object({
  template_key: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_]+$/, 'lowercase alphanumeric with underscores only'),
  language_code: z.enum(['en', 'ar']),
  category: z.enum(['transactional', 'marketing', 'authentication', 'utility']),
  body: z
    .string()
    .min(1)
    .max(1024, 'WhatsApp body must be ≤ 1024 chars')
    .refine((b) => !b.includes('{{0}}'), 'Variables start at {{1}}, not {{0}}'),
});
type SubmitTemplateForm = z.infer<typeof submitTemplateSchema>;
```

Fields rendered:

| Field           | Input               | Notes                                                                                                                          |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `template_key`  | text                | LTR, monospace, lowercase + underscore validation. helpText: "lowercase, snake_case, e.g. parent_attendance_alert"             |
| `language_code` | select              | options: en / ar. helpText: "WhatsApp requires separate templates per language."                                               |
| `category`      | select              | options: transactional / utility / authentication / marketing. helpText: "Most school comms are 'transactional' or 'utility'." |
| `body`          | textarea (rows={4}) | helpText: "Use {{1}}, {{2}}, etc. for variables. Variables must be at most 1024 chars when filled."                            |

Submit handler: `POST /api/v1/whatsapp-templates` with the form values. **The "Save & Submit" button does two things in sequence:**

1. POST the template (creates the row with `status='pending'`).
2. POST `/:id/submit` (Twilio submission) — flips to `submitted`.

If step 1 succeeds but step 2 fails, the row exists in `pending` and the user can retry from the list. The form is reset only when both succeed.

```typescript
const onSave = async (values: SubmitTemplateForm) => {
  try {
    const raw = await apiClient<{ data: TemplateRow } | TemplateRow>('/api/v1/whatsapp-templates', {
      method: 'POST',
      body: JSON.stringify(values),
    });
    const created = unwrap<TemplateRow>(raw);
    try {
      await apiClient(`/api/v1/whatsapp-templates/${created.id}/submit`, { method: 'POST' });
      toast.success(t('submit.success'));
    } catch (submitErr) {
      const message = submitErr instanceof Error ? submitErr.message : t('submit.partial');
      toast.warning(t('submit.partial', { message }));
    }
    form.reset();
    await onCreated(); // refetches list in parent
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : t('submit.error');
    toast.error(message);
  }
};
```

The form lives below the template list inside a collapsible "+ Add new template" button (default collapsed) so the page is not visually noisy when the tenant already has a healthy stable of approved templates.

---

### 5. Permission gating — top-level pattern for every page

All four pages use the same gate at the very top of the component:

```typescript
import { useRoleCheck } from '@/hooks/use-role-check';

const { hasAnyRole } = useRoleCheck();
const canManage = hasAnyRole('school_owner', 'school_principal', 'school_vice_principal');
if (!canManage) return <NoPermissionState />;
```

`NoPermissionState` is a shared inline component in `_components/no-permission-state.tsx` (NEW under the communications dir):

```typescript
// _components/no-permission-state.tsx
'use client';

import { ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

export function NoPermissionState({ locale }: { locale: string }) {
  const t = useTranslations('settings.communications.noPermission');
  return (
    <div className="mx-auto flex max-w-md flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-warning-100 p-4 text-warning-700">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <h2 className="text-lg font-semibold text-text-primary">{t('title')}</h2>
      <p className="mt-2 text-sm text-text-secondary">{t('description')}</p>
      <Link
        href={`/${locale}/settings`}
        className="mt-6 text-sm font-medium text-primary hover:underline"
      >
        {t('backToSettings')}
      </Link>
    </div>
  );
}
```

This is friendlier than redirecting — the user sees an explanation, not a silent bounce.

The backend (`@RequiresPermission('configuration.communications.manage')` on every credential controller) re-enforces. If a user with the role but without the permission key (edge case during role-mapping migration) hits the API, the controller returns 403 and the page surface bubbles a toast — not a redirect, not a crash.

---

### 6. Morph-shell sub-strip integration

The settings hub already has a shared sub-strip in `apps/web/src/lib/nav-config.ts`. Communications nav is partly already wired (line 358 references `/settings/communications` as a basePath of the `communications` hub), but the **settings hub** itself needs to expose Communications under its sub-strip group so the user can find the page from the Settings hub.

`apps/web/src/app/[locale]/(school)/settings/page.tsx` already has a `Communication` category (line 182–202) that lists `Notifications` and `Messaging policy`. Add a third tile inside that category that points to `/settings/communications`:

```typescript
{
  labelKey: 'hub.communications',
  descKey: 'hub.communicationsDesc',
  href: '/settings/communications',
  icon: Bell,
},
```

The order inside the category should be: Notifications → Messaging policy → **Communications** (new tile). All three tiles render under the same Communication category accent.

The `hub.communications` and `hub.communicationsDesc` translation keys land in the **same** translation file (`messages/en.json` and `ar.json`) under `settings.hub.*` — alongside the existing `hub.notifications` / `hub.messagingPolicy` keys.

**Sub-strip active state.** The morph shell's `activeHub` detection (in `nav-config.ts`) already includes `/settings/communications` under the `communications` hub basePaths (line 358). Verify by navigating to `/settings/communications/email` and confirming the morph bar's "Communications" hub stays active. If the hub indicator is wrong, debug the prefix-matching logic — but do not modify `nav-config.ts` for this implementation; that file is shared across many sessions and the existing entry should already work.

**Mobile.** The existing settings layout's hamburger overlay already enumerates settings hub tiles. Adding the new Communications tile to `(school)/settings/page.tsx`'s `CATEGORIES` array surfaces it in the overlay automatically (the overlay reads from the same source).

---

### 7. Mobile responsive — must work at 375 px

Each page wraps its top-level container with:

```typescript
<div className="flex min-w-0 flex-col gap-8 pb-10">
```

`min-w-0` is mandatory inside a morph-shell layout (see `frontend.md` §Layout) — flex items default to `min-width: auto` and refuse to shrink, causing overflow.

**Inputs.** Every input is `w-full` on mobile, with `text-base` (16 px) to prevent iOS auto-zoom. The credential form's two-column layout is `grid grid-cols-1 gap-4 md:grid-cols-2` — single column under 768 px, two columns above. Buttons in the form footer are `flex flex-col gap-3 sm:flex-row sm:justify-end` so the Save / Cancel buttons stack on narrow viewports without overflow.

**Tap targets.** Every action button ≥ 44 px. The `Button` component from `@school/ui` defaults to a height that meets this; no per-button override needed.

**Tables.** `DnsRecordsTable` is wrapped in `overflow-x-auto`. `TemplateList` rows are flex containers that wrap to multiple lines on mobile — the row layout is `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`.

**Index card grid.** `grid grid-cols-1 gap-6 lg:grid-cols-3` — single column under 1024 px, three columns above.

**Test-send result panels.** Inline cards (not toasts), `whitespace-pre-wrap break-all` on the verbatim error text so long stack traces from Resend / Twilio don't overflow the viewport.

---

### 8. i18n + RTL

Every string in the four pages and seven components is wrapped in `useTranslations()`. Translation keys are namespaced under `settings.communications.*` in both `messages/en.json` and `messages/ar.json`.

**Translation key tree** (add to en.json and ar.json — Arabic strings can be placeholders that match the English copy for now; the user runs the localisation pass separately):

```json
{
  "settings": {
    "communications": {
      "title": "Communications",
      "subtitle": "Configure how your school communicates with parents",

      "channels": {
        "email": "Email",
        "sms": "SMS",
        "whatsapp": "WhatsApp"
      },
      "providers": {
        "email": "via Resend",
        "sms": "via Twilio",
        "whatsapp": "via Twilio"
      },

      "status": {
        "configured": "Configured",
        "notConfigured": "Not configured",
        "verificationFailed": "Verification failed",
        "disabled": "Disabled"
      },
      "lastVerified": {
        "never": "Never",
        "justNow": "just now",
        "minutesAgo": "{n, plural, one {# minute ago} other {# minutes ago}}",
        "hoursAgo": "{n, plural, one {# hour ago} other {# hours ago}}",
        "daysAgo": "{n, plural, one {# day ago} other {# days ago}}"
      },
      "actions": {
        "configure": "Configure",
        "update": "Update",
        "save": "Save changes",
        "saving": "Saving…",
        "cancel": "Cancel",
        "delete": "Delete configuration",
        "deleteConfirm": "This will remove the {channel} configuration. Continue?"
      },
      "errors": {
        "loadFailed": "Couldn't load channel status. Please refresh.",
        "saveFailed": "Failed to save changes",
        "deleteFailed": "Failed to delete configuration"
      },

      "noPermission": {
        "title": "No access",
        "description": "You don't have permission to manage communications. Ask your school owner or principal.",
        "backToSettings": "Back to Settings"
      },

      "email": {
        "title": "Email — Resend",
        "subtitle": "Configure the email provider parents see in their inbox.",
        "fields": {
          "resendApiKey": "Resend API key",
          "resendApiKeyHint": "Get this from your Resend dashboard → API keys.",
          "fromEmail": "From email",
          "fromEmailHint": "The address parents see in their inbox.",
          "fromName": "From name (optional)",
          "fromNameHint": "Display name shown in the inbox.",
          "replyToEmail": "Reply-to email (optional)",
          "replyToEmailHint": "Where parents' replies go (defaults to From email).",
          "webhookSecret": "Webhook secret",
          "webhookSecretHint": "Used to verify Resend → EduPod callbacks. Set this in your Resend dashboard's webhook config."
        },
        "passwordToggle": {
          "show": "Show",
          "hide": "Hide"
        },
        "summary": {
          "configured": "Email is configured.",
          "rotated": "Last rotated {ts}.",
          "apiKey": "API key",
          "fromEmail": "From",
          "replyTo": "Reply-to",
          "webhookSecret": "Webhook secret"
        },
        "save": {
          "success": "Email configuration saved.",
          "error": "Failed to save email configuration."
        },
        "delete": {
          "confirm": "This will remove the email configuration and disable outbound email. Continue?",
          "success": "Email configuration deleted.",
          "error": "Failed to delete email configuration."
        },
        "test": {
          "title": "Send test email",
          "description": "Send a sentinel email to verify the configuration end-to-end.",
          "recipientLabel": "Recipient email",
          "recipientPlaceholder": "you@example.com",
          "button": "Send test message",
          "submitting": "Sending…",
          "success": "Test email sent. Check your inbox (allow 1–2 minutes).",
          "rateLimited": "Test sends are limited to 3 per hour per tenant. Try again in {n} minutes.",
          "providerErrorTitle": "Provider rejected the test send",
          "hints": {
            "INVALID_API_KEY": "Verify the API key on resend.com/api-keys.",
            "DOMAIN_NOT_VERIFIED": "Register the sending domain below before testing.",
            "RECIPIENT_INVALID": "Recipient email is malformed.",
            "RATE_LIMITED": ""
          }
        },
        "domains": {
          "title": "Sending domain verification",
          "description": "Add and verify the domains you send from. Without verified SPF, DKIM, and DMARC records, emails risk landing in spam.",
          "loading": "Loading domains…",
          "empty": "No domains registered yet.",
          "lastChecked": "Last checked: {ts}",
          "viewRecords": "View DNS records",
          "hideRecords": "Hide DNS records",
          "add": {
            "button": "+ Add domain",
            "cancel": "Cancel",
            "domainLabel": "Domain",
            "domainPlaceholder": "school.example",
            "submit": "Register",
            "submitting": "Registering…",
            "success": "Domain registered. DNS verification will start shortly.",
            "error": "Failed to register domain."
          },
          "refresh": {
            "button": "Refresh now",
            "success": "Domain status refreshed.",
            "error": "Failed to refresh domain."
          },
          "delete": {
            "button": "Delete",
            "confirm": "Remove the domain {domain} from this tenant? Outbound email will skip if no other verified domain exists.",
            "success": "Domain removed.",
            "error": "Failed to delete domain."
          },
          "status": {
            "pending": "Pending",
            "verified": "Verified",
            "failed": "Failed"
          },
          "dns": {
            "headers": {
              "type": "Type",
              "name": "Name",
              "value": "Value",
              "status": "Status"
            },
            "status": {
              "pending": "Pending",
              "verified": "Verified",
              "failed": "Failed"
            },
            "copy": {
              "aria": "Copy value",
              "success": "Copied to clipboard.",
              "error": "Failed to copy."
            }
          }
        }
      },

      "sms": {
        "title": "SMS — Twilio",
        "subtitle": "Configure outbound SMS to parents.",
        "fields": {
          "accountSid": "Twilio Account SID",
          "accountSidHint": "From your Twilio console → Account info.",
          "authToken": "Twilio Auth token",
          "authTokenHint": "Your Twilio auth token. Treat as a password.",
          "fromNumber": "Sender number",
          "fromNumberHint": "E.164 format. The number Twilio assigned to this tenant.",
          "webhookSecret": "Webhook secret",
          "webhookSecretHint": "Used to verify Twilio → EduPod callbacks."
        },
        "summary": {
          "configured": "SMS is configured.",
          "accountSid": "Account SID",
          "authToken": "Auth token",
          "fromNumber": "Sender number",
          "webhookSecret": "Webhook secret"
        },
        "save": {
          "success": "SMS configuration saved.",
          "error": "Failed to save SMS configuration."
        },
        "delete": {
          "confirm": "This will remove the SMS configuration and disable outbound SMS. Continue?",
          "success": "SMS configuration deleted.",
          "error": "Failed to delete SMS configuration."
        },
        "test": {
          "title": "Send test SMS",
          "description": "Send a sentinel SMS to verify the Twilio configuration.",
          "recipientLabel": "Recipient phone (E.164)",
          "recipientPlaceholder": "+44XXXXXXXXX",
          "button": "Send test SMS",
          "submitting": "Sending…",
          "success": "Test SMS sent.",
          "rateLimited": "Test sends are limited to 3 per hour per tenant. Try again in {n} minutes.",
          "providerErrorTitle": "Provider rejected the test send",
          "hints": {}
        }
      },

      "whatsapp": {
        "title": "WhatsApp — Twilio Business",
        "subtitle": "Configure outbound WhatsApp messaging via Twilio's Business API.",
        "fields": {
          "accountSid": "Twilio Account SID",
          "accountSidHint": "From your Twilio console → Account info.",
          "authToken": "Twilio Auth token",
          "authTokenHint": "Your Twilio auth token. Treat as a password.",
          "fromNumber": "WhatsApp sender number",
          "fromNumberHint": "E.164 format. The WhatsApp business number registered with Twilio.",
          "businessProfileId": "Business profile ID (optional)",
          "businessProfileIdHint": "Required only if your account uses multiple business profiles.",
          "webhookSecret": "Webhook secret",
          "webhookSecretHint": "Used to verify Twilio → EduPod callbacks."
        },
        "summary": {
          "configured": "WhatsApp is configured.",
          "accountSid": "Account SID",
          "authToken": "Auth token",
          "fromNumber": "Sender number",
          "businessProfileId": "Business profile",
          "webhookSecret": "Webhook secret"
        },
        "save": {
          "success": "WhatsApp configuration saved.",
          "error": "Failed to save WhatsApp configuration."
        },
        "delete": {
          "confirm": "This will remove the WhatsApp configuration and disable outbound WhatsApp. Continue?",
          "success": "WhatsApp configuration deleted.",
          "error": "Failed to delete WhatsApp configuration."
        },
        "test": {
          "title": "Send test WhatsApp message",
          "description": "Send a test using one of your approved templates.",
          "recipientLabel": "Recipient phone (E.164)",
          "recipientPlaceholder": "+44XXXXXXXXX",
          "templateLabel": "Approved template",
          "templatePlaceholder": "Choose an approved template",
          "noApprovedTemplates": "No approved WhatsApp templates yet — submit one below before testing.",
          "button": "Send test",
          "submitting": "Sending…",
          "success": "Test WhatsApp message sent.",
          "rateLimited": "Test sends are limited to 3 per hour per tenant. Try again in {n} minutes.",
          "providerErrorTitle": "Provider rejected the test send",
          "hints": {
            "OUTSIDE_SERVICE_WINDOW": "WhatsApp requires an approved template outside the 24-hour service window."
          }
        },
        "templates": {
          "title": "Templates",
          "description": "WhatsApp messages outside a 24-hour service window must use a pre-approved template.",
          "loading": "Loading templates…",
          "empty": "No templates yet. Submit your first template below.",
          "showBody": "Show body",
          "hideBody": "Hide body",
          "approvedAt": "Approved {ts}",
          "language": "Language",
          "category": "Category",
          "rejectedReason": "Rejected: {reason}",
          "status": {
            "pending": "Pending",
            "submitted": "Submitted",
            "approved": "Approved",
            "rejected": "Rejected",
            "paused": "Paused"
          },
          "categories": {
            "transactional": "Transactional",
            "marketing": "Marketing",
            "authentication": "Authentication",
            "utility": "Utility"
          },
          "actions": {
            "submit": {
              "button": "Submit to Twilio",
              "success": "Template submitted to Twilio for approval.",
              "error": "Failed to submit template."
            },
            "sync": {
              "button": "Sync status",
              "success": "Template status synced.",
              "error": "Failed to sync template status."
            },
            "pause": {
              "button": "Pause",
              "success": "Template paused.",
              "error": "Failed to pause template."
            },
            "resume": {
              "button": "Resume",
              "success": "Template resumed.",
              "error": "Failed to resume template."
            },
            "delete": {
              "button": "Delete",
              "confirm": "Remove the template {key}?",
              "success": "Template deleted.",
              "error": "Failed to delete template."
            }
          },
          "submitForm": {
            "title": "Submit a new template",
            "addButton": "+ Add new template",
            "cancel": "Cancel",
            "templateKey": "Template key",
            "templateKeyHint": "Lowercase, snake_case, e.g. parent_attendance_alert.",
            "languageCode": "Language",
            "category": "Category",
            "body": "Body",
            "bodyHint": "Use {{1}}, {{2}}, … for variables. Body must be ≤ 1024 characters.",
            "saveAndSubmit": "Save & Submit",
            "submitting": "Saving…",
            "success": "Template submitted to Twilio.",
            "partial": "Template saved but Twilio submission failed. You can retry from the list.",
            "error": "Failed to save template."
          }
        }
      }
    }
  }
}
```

**Arabic file** — copy the same structure to `messages/ar.json` with placeholder Arabic copy translated by the user later. To keep the file machine-mergeable, the implementation deep-merges into the existing `settings.*` namespace using a re-read-then-write approach (per CLAUDE.md §Per-session commit hygiene):

1. Read `messages/en.json` (full).
2. Deep-merge `settings.communications` block.
3. Write back.
4. Repeat for `messages/ar.json`.

Do **not** overwrite the file with a stale copy. The deep-merge is mechanical: parse, set the `settings.communications` key, stringify with 2-space indent, write.

**Add `settings.hub.communications` and `settings.hub.communicationsDesc`** to the existing `settings.hub.*` namespace (touch the same file, but a different sub-tree — the `hub` block is already there at the top of the `settings` namespace).

**RTL audit checklist for every component file in this impl:**

- [ ] No `pl-` / `pr-` / `ml-` / `mr-` / `left-` / `right-` / `text-left` / `text-right` / `rounded-l-` / `rounded-r-` / `border-l-` / `border-r-`. Use `ps-` / `pe-` / `ms-` / `me-` / `start-` / `end-` / `text-start` / `text-end` / `rounded-s-` / `rounded-e-` / `border-s-` / `border-e-`.
- [ ] Every email address, phone number, API key, DNS record value, template key wrapped in `dir="ltr"` (input element or surrounding `<span>`).
- [ ] Every chevron / arrow icon has `rtl:rotate-180`.
- [ ] Tested in `/ar` locale during the Playwright walk.

Pre-commit lint should already enforce most of this (the project's ESLint config + Tailwind plugin), but human review is a backstop.

---

## Tests

### Component tests (Jest + React Testing Library)

Co-located `.spec.tsx` files next to each new component. Coverage targets at least:

#### `page.spec.tsx` (index page)

- Renders three skeleton cards while loading.
- Renders three `ChannelCard`s after `Promise.allSettled` resolves with mixed results (one configured, one verification_failed, one not_configured).
- Each card's CTA links to the correct sub-page.
- A user without admin roles sees `<NoPermissionState />` instead of the cards.
- 500 errors on one channel set that channel to `not_configured` and surface a toast (asserted via mocked `toast.error`).

#### `email/page.spec.tsx`

- Initial 404 → form is shown empty, submit button enabled.
- Initial 200 with masked values → read-only summary panel rendered, masked values displayed.
- Click "Update" → switches to edit mode with empty plaintext fields.
- Submit a valid form → PUT call, success toast, summary re-shows masked values from the PUT response.
- Submit invalid `from_email` → form-level error displayed, no PUT.
- Submit invalid `webhook_secret` (< 8 chars) → form-level error, no PUT.
- Save button disabled while `isSubmitting`.
- Click "Delete configuration" → window.confirm + DELETE call + summary clears.
- "Send test message" with valid email → POST call, success banner.
- POST returns 400 with `code: 'INVALID_API_KEY'` → red banner with the verbatim provider error and the localised hint.
- POST returns 429 with `code: 'RATE_LIMITED'` and `details.retry_after_min: 23` → amber banner with "Try again in 23 minutes."

#### `email/_components/domain-verification-card.spec.tsx`

- Initial empty list → "No domains registered yet" message rendered.
- Click "+ Add domain" → form expands.
- Submit valid domain → POST call, list reloads, new row appears.
- Click "View DNS records" on a row → expander reveals DNS records table.
- Click "Refresh now" → POST call, row's `last_checked_at` updates.
- Click "Delete" → confirm modal, DELETE call, row removed.
- Domain row with `status: 'verified'` shows green pill; `'pending'` amber; `'failed'` red.

#### `email/_components/dns-records-table.spec.tsx`

- Renders 3 rows for SPF / DKIM / DMARC.
- Each row's `value` cell has `dir="ltr"`.
- Click "Copy" calls `navigator.clipboard.writeText` and surfaces success toast (mock `clipboard`).

#### `sms/page.spec.tsx`

- Mirror of email tests minus domain card. Phone number input rejects non-E.164. Test send sends SMS path.

#### `whatsapp/page.spec.tsx`

- Mirror of email tests minus domain card.
- Test-send card disabled when no approved templates exist.
- Test-send dropdown lists only approved templates.

#### `whatsapp/_components/template-list.spec.tsx`

- Renders list of templates from mocked `/v1/whatsapp-templates`.
- Per-status action button visibility is correct (e.g. `pending` shows Submit only).
- Submit / Sync / Pause / Resume / Delete each call the correct endpoint.
- Body expander toggle works.
- Status badge classes match the colour map.

#### `whatsapp/_components/template-submit-form.spec.tsx`

- Valid form → POST + POST submit chain. Both calls made; form resets; success toast.
- Step 1 succeeds, step 2 fails → warning toast with "saved but submission failed" message; form does NOT reset (so user can re-trigger submit from the list).
- `template_key` rejecting invalid characters (uppercase, dashes) — form-level error.
- `body` > 1024 chars → form-level error.

#### Permission gate tests

- Each page: render with `useRoleCheck` mock returning `hasAnyRole: () => false` → asserts `NoPermissionState` is rendered, not the page contents.

#### Locale rendering tests

- Each page: mock `useTranslations` to return Arabic strings; assert RTL classes (`dir="rtl"` on the `<html>`) and that `text-start` resolves to right-aligned via the existing `direction-provider` (mocked).
- Assert: no element in the rendered tree has a hardcoded directional class (`ml-`, `mr-`, etc.). Use a snapshot + a custom `expect` matcher: walk every element, regex its `className`, fail on `/(?<![a-z])(?:m|p)(?:l|r)-/` or `/text-(?:left|right)/`.

#### Mobile rendering tests

- Render at 375 px via RTL's `setViewport` or component-level prop (use `@testing-library/react`'s `render` with a `<div style={{ width: 375 }}>` wrapper). Assert: no horizontal scroll on the root container, single-column form layout, action buttons stack.

### MSW / fetch mocks

Use the project's existing test infrastructure. If MSW handlers for `/api/v1/email-config`, `/sms-config`, `/whatsapp-config`, `/email-domains`, `/whatsapp-templates` don't already exist (Impl 03 / 07 / 08 may have added their own), create them in `apps/web/src/__tests__/mocks/communications.handlers.ts` and import in each spec file's `beforeAll`. If MSW isn't set up at all in the web app, fall back to per-spec `jest.fn()` mocks of `apiClient` (the existing fallback page tests use direct mocks — match that pattern for consistency).

### Test commands

```bash
pnpm --filter @school/web test
pnpm --filter @school/web type-check
pnpm --filter @school/web lint
```

Run them all locally before committing. Coverage threshold per `jest.config.js` must be met for every new file.

---

## Verification (local dev server — Playwright walkthrough is mandatory)

This is the first implementation in the rebuild that ships UI. Per IMPLEMENTATION_LOG.md Rule 27a: **Playwright verification on `http://localhost:5551` is mandatory before flipping the row to `completed`.**

### Pre-flight

1. Confirm prerequisite implementations are `completed`:
   - 03 (`email-config`, `sms-config`, `whatsapp-config` controllers).
   - 07 (`email-domains` controller + cron).
   - 08 (`whatsapp-templates` controller + cron).
   - 09 (test-send endpoints with verbatim error semantics).
2. Start local dev:

   ```bash
   pnpm --filter @school/api dev      # API on :3001
   pnpm --filter @school/worker dev   # worker
   pnpm --filter @school/web dev      # web on :5551
   ```

3. Confirm DI is healthy:

   ```bash
   curl -s http://localhost:3001/api/health
   ```

4. Acquire the Playwright lock per Rule 27b — append a one-line claim to `IMPLEMENTATION_LOG.md` §5:

   ```
   ### [PLAYWRIGHT LOCK] — impl 11
   - Holder: frontend settings UI verification
   - Started: <ISO>
   - Until: released by closing the browser AND appending a follow-up release line
   ```

   Before writing the claim, scan the log for a previous unmatched `[PLAYWRIGHT LOCK]` — if one exists, wait or block.

### Walkthrough script (cap at ~20 minutes per memory)

Authenticate as `owner@nhqs.test` against the local dev DB:

1. `mcp__plugin_playwright_playwright__browser_navigate('http://localhost:5551/en/login')`.
2. Fill email / password, submit.
3. Confirm landing on the dashboard.

**Index page:**

4. Navigate to `http://localhost:5551/en/settings/communications`.
5. Assert: three channel cards render. Email / SMS / WhatsApp.
6. Each card shows the appropriate status. With NHQS not yet configured for any channel (assuming Impl 13 hasn't backfilled yet — which is the case because Impl 11 runs before Impl 13), all three should read "Not configured".
7. `browser_console_messages(level: 'error')` → assert empty.

**Email page:**

8. Click "Configure" on the Email card → routes to `/en/settings/communications/email`.
9. Assert: form rendered with all five fields empty.
10. Fill the form with test Resend credentials:
    - `resend_api_key`: `re_test_dummy_DELETEME_XXXXXXXX` (or, if you have a real test key for the dev environment, use it).
    - `from_email`: `test@nhqs.test`.
    - `from_name`: `NHQS Test`.
    - `reply_to_email`: leave blank.
    - `webhook_secret`: `whsec_local_dev_secret_at_least_eight_chars`.
11. Click "Save changes". Confirm: success toast, form switches to read-only summary with masked `••••••••XXXX` values.
12. Reload the page. Confirm: masked summary persists (server returned the saved values).
13. Click "Send test message". Recipient: `you@example.com` (any inbox you can check). Click "Send".
14. Assert: result panel renders. If the test Resend key is real, expect green success. If dummy, expect red banner with the verbatim "Invalid API key" provider error and the localised hint "Verify the API key on resend.com/api-keys".
15. **Domain verification card.** Click "+ Add domain". Enter `nhqs.test`. Click "Register".
16. Assert: row appears with status "Pending" and SPF / DKIM / DMARC records listed.
17. Click "View DNS records" → expander reveals 3 rows.
18. Click "Refresh now" → status updates.
19. Click "Delete" on the domain row → window.confirm fires; accept → row removed.

**SMS page:**

20. Navigate to `/en/settings/communications/sms`.
21. Fill credentials with test Twilio creds (or dummy). Save. Confirm masked summary.
22. Send a test SMS to `+447700900000` (or your dev test phone). Confirm success or verbatim error banner.

**WhatsApp page:**

23. Navigate to `/en/settings/communications/whatsapp`.
24. Fill credentials. Save. Masked summary.
25. **Templates section.** Click "+ Add new template".
26. Fill: `template_key=test_attendance`, `language_code=en`, `category=transactional`, `body=Hi {{1}}, this is a test for {{2}}.`
27. Click "Save & Submit". Assert: row appears with status "Submitted" (or "Pending" if Twilio submission failed — the partial-success path).
28. Click "Sync status". Assert: action call fires.
29. Test-send card: select the template, enter `+447700900000`, click "Send test". Verify result.

**RTL pass:**

30. Navigate to `/ar/settings/communications/email`.
31. Assert: layout flips to RTL. The form labels appear on the start (right) edge. Buttons appear on the end (left) edge for RTL. Email addresses, API keys, DNS values stay LTR.
32. `browser_console_messages(level: 'error')` → assert empty.

**Mobile pass:**

33. `browser_resize(375, 812)`.
34. Reload `/en/settings/communications`.
35. Assert: cards stack single-column. No horizontal scrollbar on `<body>`.
36. Navigate into Email page; assert form is single-column. Inputs `text-base`. Tap targets ≥ 44 px (eyeball check).
37. Navigate into WhatsApp; assert template list rows stack vertically.

**Cleanup:**

38. Delete every configuration created during this walk so the next session sees a clean state. (DELETE buttons on each page.)
39. Delete any registered test domains.
40. **Remove every screenshot taken** — per memory, screenshots OK during the walk but must be deleted before commit. Run `find . -name "*.png" -newer ../implementations -delete` (limit to files added in this session).
41. Release the Playwright lock — append the matching `[PLAYWRIGHT RELEASED]` line.

### Success criteria

- Every page loads without console errors at `http://localhost:5551`.
- Every form submits successfully with valid data.
- Every form rejects invalid data inline (no submit firing).
- Masked credentials display correctly after a fresh load.
- Test-send paths surface verbatim provider errors when the call fails.
- Domain verification card lists, refreshes, deletes domains correctly.
- Template list and submission form work end-to-end.
- RTL pass shows correct layout flip; LTR-forced fields stay LTR.
- Mobile pass at 375 px shows single-column stack with no horizontal overflow.
- The §5 completion record includes a `## Local verification` block listing every page covered, console-error count (zero), and the run timestamp.

### Backend smoke (in addition to Playwright)

Run these `curl` smokes before opening Playwright — quicker to debug than a UI bisect:

```bash
# Auth
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"owner@nhqs.test","password":"Password123!"}' | jq -r .access_token)

# Email config — empty (404)
curl -i -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/v1/email-config

# PUT email config
curl -i -X PUT -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"resend_api_key":"re_test_xxxxx","from_email":"test@nhqs.test","webhook_secret":"whsec_dev_eight"}' \
  http://localhost:3001/api/v1/email-config
# Expect 200 with masked response.

# DELETE
curl -i -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/v1/email-config
# Expect 204.
```

These mirror the page's API calls; if they pass, page behaviour is mostly correct and any frontend issues are wiring / state bugs.

---

## Files touched

```
apps/web/src/app/[locale]/(school)/settings/communications/
├── page.tsx                                                                        [NEW]
├── page.spec.tsx                                                                   [NEW]
├── _components/
│   ├── password-input.tsx                                                          [NEW — hoisted from stripe page]
│   ├── password-input.spec.tsx                                                     [NEW]
│   └── no-permission-state.tsx                                                     [NEW]
├── email/
│   ├── page.tsx                                                                    [NEW]
│   ├── page.spec.tsx                                                               [NEW]
│   └── _components/
│       ├── domain-verification-card.tsx                                            [NEW]
│       ├── domain-verification-card.spec.tsx                                       [NEW]
│       ├── dns-records-table.tsx                                                   [NEW]
│       └── dns-records-table.spec.tsx                                              [NEW]
├── sms/
│   ├── page.tsx                                                                    [NEW]
│   └── page.spec.tsx                                                               [NEW]
├── whatsapp/
│   ├── page.tsx                                                                    [NEW]
│   ├── page.spec.tsx                                                               [NEW]
│   └── _components/
│       ├── template-list.tsx                                                       [NEW]
│       ├── template-list.spec.tsx                                                  [NEW]
│       ├── template-submit-form.tsx                                                [NEW]
│       └── template-submit-form.spec.tsx                                           [NEW]
└── fallback/                                                                       [unchanged from existing impl]
    └── page.tsx

# Translation files (deep-merge — never overwrite)
apps/web/messages/en.json                                                           [updated: +settings.communications.* and +settings.hub.communications]
apps/web/messages/ar.json                                                           [updated: same keys, placeholder Arabic copy]

# Settings hub adds the Communications tile
apps/web/src/app/[locale]/(school)/settings/page.tsx                                [updated: add hub tile under Communication category]

# Stripe page imports the hoisted PasswordInput (refactor only — same body)
apps/web/src/app/[locale]/(school)/settings/stripe/page.tsx                         [updated: replace local PasswordInput with import]

# Optional MSW handlers for tests (only if MSW is already wired into the web app)
apps/web/src/__tests__/mocks/communications.handlers.ts                             [NEW, optional]
```

**Files NOT touched in this impl:**

- `apps/web/src/lib/nav-config.ts` — already lists `/settings/communications` under the `communications` hub basePaths (line 358). Confirm during verification; do not modify.
- Any backend file. Impl 11 is frontend-only.
- `packages/shared/*` — schemas were finalised in Impl 03; this impl imports them.
- Architecture docs — owned by Impl 14 per Rule 14.

---

## Rollback

This rebuild commits to a worktree (per Rule 5). To undo:

```bash
cd <worktree-dir>
git revert <commit-sha-of-impl-11>
```

The revert removes:

- All four pages (index + email + sms + whatsapp).
- All seven new components in the `_components/` trees.
- The Communications tile addition from the settings hub.
- The PasswordInput import flip in the Stripe page (the inline component returns).
- The new `settings.communications.*` translation keys (left dangling but harmless if a stale build references them — translation keys silently fall through to the key string).

No database changes. No worker changes. No backend changes. Permissions are unaffected (they're seeded by Impl 02). The morph shell continues to route `/settings/communications` (now a 404) under the `communications` hub — that's the only visible artefact, and it disappears once a user navigates away.

If the revert sweeps up sibling-session work (Impl 12 may be running in parallel in Wave 4), use `git revert --no-commit <sha>` and selectively unstage the unrelated files before committing the revert. Per Rule 26, "when in doubt, shrink the commit."

---

## Follow-ups

- **Impl 13** (Tenant backfill) seeds 5 test tenants × 3 channels in the dev DB. After Impl 13, the `/settings/communications` index page on every test tenant should render three "Configured" cards.
- **Impl 14** (E2E verification) re-walks every page in this implementation as part of the comprehensive verification. The §Verification block above is a subset of Impl 14's broader walk.
- **V2 follow-up** (out of scope for this rebuild): unsubscribe / suppression-list management UI. Currently surfaced only via DB / runbook. Future work.
- **V2 follow-up**: bulk template export / import for tenants with many WhatsApp templates. Out of scope.
- **V2 follow-up**: surface engagement metrics (open rate, click rate) per channel on the index page. Currently the architecture skips engagement (`notification_engagement_event` table is V2 — see PLAN.md §2 "Out of scope").
- **Permission backfill caveat.** Impl 02 backfills `configuration.communications.manage` onto the role mappings of all 5 test tenants. If a deployment merge happens after only some role mappings are updated, edge-case users in other tenants may see the page (admin role check passes) but get 403 on save. The page handles this gracefully via the toast surface, but the user-visible UX is a "save failed" toast rather than a friendly gate. The backend is the source of truth; the role-based UI gate is a UX hint.
