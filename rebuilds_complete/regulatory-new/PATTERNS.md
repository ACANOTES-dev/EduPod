# Patterns Reference

Extracted from the shipped hubs that set the visual bar for regulatory: **Wellbeing**, **Finance**, and **Safeguarding**. This is a copy-paste reference so each phase doc can stay focused on its scope.

Primary sources:

- `apps/web/src/app/[locale]/(school)/wellbeing/page.tsx`
- `apps/web/src/app/[locale]/(school)/finance/page.tsx`
- `apps/web/src/app/[locale]/(school)/safeguarding/page.tsx`
- `apps/web/src/app/[locale]/(school)/safeguarding/concerns/page.tsx` (list-page reference)
- `docs/plans/ux-redesign-final-spec.md` §14

---

## 1. Hub page skeleton

```tsx
'use client';

import { AlertTriangle, ArrowRight, RefreshCw /* ...domain icons... */ } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { HubTile } from '@/components/hub-tile';
import { CardSkeleton, KpiTile } from '@/components/kpi-tile';
import { PageHeader } from '@/components/page-header';
import { QuickAction } from '@/components/quick-action';
import { apiClient } from '@/lib/api-client';

interface HubCardConfig {
  key: string;
  href: string;
  icon: LucideIcon;
  accent: string; // Tailwind gradient classes, teal family for regulatory
  iconBg: string; // bg-teal-100 text-teal-700
  glow: string; // hover-glow utility
  roles?: RoleKey[];
}

const HUB_CARDS: HubCardConfig[] = [
  {
    key: 'tusla',
    href: '/regulatory/tusla',
    icon: FileCheck2,
    accent: 'from-teal-400 via-teal-500 to-teal-600',
    iconBg: 'bg-teal-100 text-teal-700',
    glow: 'hover:shadow-teal-200/50',
  },
  // ...
];

export default function RegulatorySuperHub() {
  const t = useTranslations('regulatory');
  const [summary, setSummary] = React.useState<RegulatoryDashboard | null>(null);
  const [error, setError] = React.useState<Error | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    apiClient<RegulatoryDashboard>('/api/v1/regulatory/dashboard')
      .then(setSummary)
      .catch((err) => {
        console.error('[RegulatorySuperHub.load]', err);
        setError(err);
      });
  }, [reloadKey]);

  return (
    <div className="flex min-w-0 flex-col gap-8 pb-10">
      <PageHeader title={t('title')} description={t('description')} />

      {error && <ErrorBanner onRetry={() => setReloadKey((k) => k + 1)} />}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiTile label={t('kpi.overdueItems')} value={summary?.overdue} tone="danger" />
        <KpiTile label={t('kpi.upcomingDeadlines')} value={summary?.upcoming} />
        <KpiTile label={t('kpi.ppodHealth')} value={summary?.ppodHealth} format="percent" />
        <KpiTile
          label={t('kpi.lastDesSubmission')}
          value={summary?.lastDes}
          format="relative-date"
        />
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <QuickAction
          icon={FileText}
          label={t('quick.generateSar')}
          href="/regulatory/tusla/sar"
          gradient="..."
        />
        {/* ... */}
      </section>

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        {HUB_CARDS.map((card, i) => (
          <HubTile
            key={card.key}
            href={card.href}
            icon={card.icon}
            accent={card.accent}
            iconBg={card.iconBg}
            glow={card.glow}
            title={t(`hub.${card.key}.title`)}
            description={t(`hub.${card.key}.description`)}
            count={summary?.counts?.[card.key]}
            style={{ animationDelay: `${i * 60}ms` }}
          />
        ))}
      </section>

      <UpcomingDeadlinesFeed items={summary?.upcomingFeed ?? []} />
    </div>
  );
}
```

Spacing:

- Page wrapper: `flex min-w-0 flex-col gap-8 pb-10`
- KPI grid: `grid grid-cols-2 gap-3 sm:grid-cols-4`
- QuickAction grid: `grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4`
- HubTile grid: `grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3`

---

## 2. Sub-hub page

Identical skeleton, plus `PageHeader.back` → parent hub, plus scoped KPIs, plus scoped HubTile list for that sub-module's leaf pages.

```tsx
<PageHeader
  title={t('tusla.title')}
  description={t('tusla.description')}
  back={{ href: `/${locale}/regulatory`, label: t('backToRegulatory') }}
  actions={
    <Link href={`/${locale}/regulatory/tusla/sar`} className="...">
      {t('tusla.newSar')}
    </Link>
  }
/>
```

---

## 3. List page

```tsx
<div className="flex min-w-0 flex-col gap-6 pb-10">
  <PageHeader
    title={t('list.title')}
    back={{ href: `/${locale}/regulatory/tusla`, label: t('backToTusla') }}
    actions={<button onClick={openCreate}>{t('list.newRecord')}</button>}
  />

  {error && <ErrorBanner onRetry={refetch} />}

  {/* Summary strip — optional, 3-up buckets */}
  <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <SummaryCard tone="danger" label={...} value={...} />
    <SummaryCard tone="warning" label={...} value={...} />
    <SummaryCard tone="success" label={...} value={...} />
  </section>

  {/* Filters */}
  <section className="rounded-2xl border border-border bg-surface p-4">
    <div className="mb-3 flex items-center justify-between">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Filter className="h-4 w-4" /> {t('filters.title')}
      </span>
      <button onClick={reset} className="text-xs text-text-secondary">
        {t('filters.reset')}
      </button>
    </div>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Input ... />
      <Select ... />
      <Input type="date" ... />
      <Input type="date" ... />
    </div>
  </section>

  {/* Results */}
  <section className="rounded-2xl border border-border bg-surface">
    <header className="flex items-center justify-between px-5 py-3 text-sm text-text-secondary">
      <span>{t('results.countLabel', { total, page, totalPages })}</span>
    </header>
    {isLoading ? (
      <ul className="divide-y divide-border/50">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="animate-pulse px-5 py-4">
            <div className="h-4 w-2/3 rounded bg-border/60" />
          </li>
        ))}
      </ul>
    ) : rows.length === 0 ? (
      <EmptyState icon={FileText} title={t('empty.title')} description={t('empty.body')} />
    ) : (
      <ul className="divide-y divide-border/50">
        {rows.map((row) => <RowLink key={row.id} row={row} />)}
      </ul>
    )}
  </section>

  {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
</div>
```

---

## 4. Detail page

```tsx
<div className="flex min-w-0 flex-col gap-6 pb-10">
  <PageHeader
    title={record.title}
    back={{ href: backHref, label: t('backToList') }}
    actions={<EditCloseExportCluster />}
  />

  {/* Identity strip */}
  <section className="rounded-2xl border border-border bg-surface p-5">
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-mono text-sm" dir="ltr">
        {record.reference}
      </span>
      <StatusBadge status={record.status} />
      <span className="text-sm text-text-secondary">{formatDate(record.createdAt)}</span>
    </div>
  </section>

  {/* Split layout */}
  <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
    <div className="flex flex-col gap-6">
      <Section title="...">...</Section>
      <Section title="...">...</Section>
    </div>
    <aside className="flex flex-col gap-6">
      <Section title={t('auditLog.title')}>
        <AuditLogList />
      </Section>
      <Section title={t('access.title')}>
        <AccessGrantsList />
      </Section>
    </aside>
  </div>

  {/* Danger zone */}
  <section className="rounded-2xl border border-danger-200 bg-danger-50/40 p-5">
    <h2 className="text-base font-semibold text-danger-800">{t('dangerZone.title')}</h2>
    <div className="mt-3 flex flex-wrap gap-3">
      <button onClick={openArchiveDialog}>...</button>
    </div>
  </section>
</div>
```

---

## 5. Shared components to use (not re-invent)

| Component                 | Path                                       | When to use                                                                          |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `PageHeader`              | `apps/web/src/components/page-header.tsx`  | Every page, always. Gives us title, description, back, and actions in one primitive. |
| `KpiTile`, `CardSkeleton` | `apps/web/src/components/kpi-tile.tsx`     | KPI strip cells and their loading states.                                            |
| `QuickAction`             | `apps/web/src/components/quick-action.tsx` | Quick-action pill row on hubs.                                                       |
| `HubTile`                 | `apps/web/src/components/hub-tile.tsx`     | Grid of sub-module cards.                                                            |
| `EmptyState`              | `apps/web/src/components/empty-state.tsx`  | Any "no results" UI.                                                                 |
| `DataTable`               | `apps/web/src/components/data-table.tsx`   | List pages when divided-list `<ul>` isn't expressive enough.                         |
| `StatusBadge`             | `apps/web/src/components/status-badge.tsx` | Status / state pills.                                                                |
| shadcn primitives         | `packages/ui/src/components/*`             | Dialog, Select, Input, Button, Tooltip, Switch, Separator, etc.                      |

Do not install new component libraries. Do not roll new wrappers around existing components.

---

## 6. Animation

- Fade-in on mount: `animate-in fade-in slide-in-from-bottom-1 duration-300`
- Staggered hub tiles: pass `style={{ animationDelay: \`${i \* 60}ms\` }}`.
- Hover lift: `transition-all hover:-translate-y-0.5 hover:shadow-lg`.
- Avoid heavy Framer Motion — stick to CSS utilities.

---

## 7. Data fetching pattern

```tsx
const [data, setData] = React.useState<T | null>(null);
const [error, setError] = React.useState<Error | null>(null);
const [reloadKey, setReloadKey] = React.useState(0);

React.useEffect(() => {
  let cancelled = false;
  apiClient<T>('/api/v1/...')
    .then((res) => {
      if (!cancelled) setData(res);
    })
    .catch((err) => {
      if (cancelled) return;
      console.error('[PageName.load]', err);
      setError(err);
    });
  return () => {
    cancelled = true;
  };
}, [reloadKey]);
```

Where the backend wraps the response in `{ data: ... }`, the shared fix (Phase 1 decision) applies — either `apiClient` is extended to always unwrap, or we unwrap at the call site consistently. Either way, every phase uses the same convention.
