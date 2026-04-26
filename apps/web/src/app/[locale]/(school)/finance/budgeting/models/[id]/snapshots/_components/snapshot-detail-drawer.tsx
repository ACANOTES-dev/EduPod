'use client';

import { ChevronDown, ChevronRight, FileSpreadsheet, FileText } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
} from '@school/ui';

import { apiClient } from '@/lib/api-client';

import { CurrencyDisplay } from '../../../../../_components/currency-display';

import type { SnapshotDetail } from './snapshot-types';

interface Props {
  open: boolean;
  modelId: string;
  snapshotId: string | null;
  currencyCode: string;
  locale: string;
  onClose: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

export function SnapshotDetailDrawer({
  open,
  modelId,
  snapshotId,
  currencyCode,
  locale,
  onClose,
}: Props) {
  const t = useTranslations('financeBudgetingSnapshots.detail');
  const [detail, setDetail] = React.useState<SnapshotDetail | null>(null);
  const [isLoading, setIsLoading] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!open || !snapshotId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      try {
        const res = await apiClient<SnapshotDetail>(
          `/api/v1/budgeting/financial-models/${modelId}/snapshots/${snapshotId}`,
        );
        if (cancelled) return;
        setDetail(res);
      } catch (err) {
        console.error('[SnapshotDetailDrawer.load]', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, snapshotId, modelId]);

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <SheetContent
        side="end"
        className="flex w-full flex-col gap-4 overflow-y-auto p-6 sm:max-w-2xl"
      >
        <SheetHeader>
          <SheetTitle>{detail ? t('title', { n: detail.version_number }) : ''}</SheetTitle>
          <SheetDescription>
            {detail
              ? new Date(detail.published_at).toLocaleDateString(locale, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })
              : ''}
          </SheetDescription>
        </SheetHeader>

        {isLoading || !detail ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        ) : (
          <DrawerBody detail={detail} currencyCode={currencyCode} locale={locale} />
        )}

        {detail && (
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <Button asChild variant="outline" disabled={!detail.pdf_object_key}>
              <a
                href={`${API_URL}/api/v1/budgeting/financial-models/${modelId}/snapshots/${detail.id}/exports/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!detail.pdf_object_key}
              >
                <FileText className="me-2 h-4 w-4" aria-hidden="true" />
                {t('downloadPdf')}
              </a>
            </Button>
            <Button asChild variant="outline" disabled={!detail.excel_object_key}>
              <a
                href={`${API_URL}/api/v1/budgeting/financial-models/${modelId}/snapshots/${detail.id}/exports/excel`}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={!detail.excel_object_key}
              >
                <FileSpreadsheet className="me-2 h-4 w-4" aria-hidden="true" />
                {t('downloadExcel')}
              </a>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({
  detail,
  currencyCode,
  locale,
}: {
  detail: SnapshotDetail;
  currencyCode: string;
  locale: string;
}) {
  const t = useTranslations('financeBudgetingSnapshots.detail');
  const totals = detail.payload.base_case.totals_by_year[0];
  const perPupil = detail.payload.base_case.per_pupil_unit_economics[0];
  const drivers = detail.payload.model.drivers;
  const driverEntries = Object.entries(drivers).filter(
    ([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean',
  ) as Array<[string, string | number | boolean]>;

  return (
    <div className="flex flex-col gap-3">
      {/* Executive summary */}
      <Section title={t('executiveSummaryHeader')} defaultOpen>
        {detail.executive_summary ? (
          <p className="whitespace-pre-line text-sm text-text-primary">
            {detail.executive_summary}
          </p>
        ) : (
          <p className="text-sm text-text-tertiary">{t('noSummary')}</p>
        )}
      </Section>

      {/* KPI strip */}
      <Section title={t('kpiHeader')} defaultOpen>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label={t('kpiRevenue')}
            value={totals?.revenue ?? 0}
            currencyCode={currencyCode}
            locale={locale}
            accent="emerald"
          />
          <Kpi
            label={t('kpiExpenditure')}
            value={totals?.expenditure ?? 0}
            currencyCode={currencyCode}
            locale={locale}
            accent="red"
          />
          <Kpi
            label={t('kpiNet')}
            value={totals?.net_result ?? 0}
            currencyCode={currencyCode}
            locale={locale}
            accent={(totals?.net_result ?? 0) >= 0 ? 'emerald' : 'red'}
          />
          <Kpi
            label={t('kpiPerPupil')}
            value={perPupil?.net_per_student ?? 0}
            currencyCode={currencyCode}
            locale={locale}
            accent="violet"
          />
        </dl>
      </Section>

      {/* Drivers */}
      <Section title={t('driversHeader')}>
        <ul className="flex flex-col gap-1 text-sm">
          {driverEntries.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between gap-2">
              <span className="text-text-secondary">{k.replace(/_/g, ' ')}</span>
              <span dir="ltr" className="font-mono text-text-primary">
                {String(v)}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* Line items */}
      <Section title={t('lineItemsHeader')}>
        <table className="w-full text-sm">
          <thead className="text-xs text-text-tertiary">
            <tr>
              <th className="px-2 py-1 text-start">{t('liCategory')}</th>
              <th className="px-2 py-1 text-start">{t('liName')}</th>
              <th className="px-2 py-1 text-end">{t('liAmount')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {detail.payload.base_case.line_items.map((li) => (
              <tr key={li.id}>
                <td className="px-2 py-1 text-text-secondary">{li.category}</td>
                <td className="px-2 py-1 text-text-primary">{li.name}</td>
                <td dir="ltr" className="px-2 py-1 text-end font-mono tabular-nums">
                  <CurrencyDisplay
                    amount={li.amount}
                    currency_code={currencyCode}
                    locale={locale}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Scenarios */}
      {detail.payload.scenarios.length > 0 && (
        <Section title={t('scenariosHeader')}>
          <ul className="flex flex-col gap-2 text-sm">
            {detail.payload.scenarios.map((s) => (
              <li key={s.id} className="rounded-2xl border border-border bg-surface p-3">
                <p className="font-semibold text-text-primary">{s.name}</p>
                {s.notes && <p className="mt-1 text-xs text-text-secondary">{s.notes}</p>}
                <p className="mt-2 text-xs text-text-tertiary">
                  {t('driverOverridesCount', {
                    count: Object.keys(s.driver_overrides).length,
                  })}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState<boolean>(Boolean(defaultOpen));
  return (
    <section className="rounded-2xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-start"
      >
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {open ? (
          <ChevronDown className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-4 w-4 text-text-tertiary rtl:rotate-180" aria-hidden="true" />
        )}
      </button>
      {open && <div className="border-t border-border px-4 py-3">{children}</div>}
    </section>
  );
}

function Kpi({
  label,
  value,
  currencyCode,
  locale,
  accent,
}: {
  label: string;
  value: number;
  currencyCode: string;
  locale: string;
  accent: 'emerald' | 'red' | 'violet';
}) {
  const accentClass =
    accent === 'emerald'
      ? 'text-emerald-700'
      : accent === 'red'
        ? 'text-red-700'
        : 'text-violet-700';
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-text-tertiary">{label}</dt>
      <dd dir="ltr" className={`mt-1 font-mono text-base font-semibold ${accentClass}`}>
        <CurrencyDisplay amount={value} currency_code={currencyCode} locale={locale} />
      </dd>
    </div>
  );
}
