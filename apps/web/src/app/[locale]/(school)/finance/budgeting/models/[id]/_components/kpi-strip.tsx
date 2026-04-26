'use client';

import { ArrowDownRight, ArrowUpRight, Coins, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { PerPupilEconomics, YearTotals } from '@school/shared/budgeting';

import { CurrencyDisplay } from '../../../../_components/currency-display';

interface Props {
  totals: YearTotals | null;
  perPupil: PerPupilEconomics | null;
  year: number;
  currencyCode: string;
  locale: string;
  isSaving: boolean;
}

export function KpiStrip({ totals, perPupil, year, currencyCode, locale, isSaving }: Props) {
  const t = useTranslations('financeBudgetingWorkspace.kpi');

  const revenue = totals?.revenue ?? 0;
  const expenditure = totals?.expenditure ?? 0;
  const net = totals?.net_result ?? 0;
  const isOverspend = expenditure > revenue;

  return (
    <section className="relative grid grid-cols-2 gap-3 lg:grid-cols-4">
      {isSaving && (
        <span className="pointer-events-none absolute end-0 -top-6 text-xs text-text-tertiary">
          {t('saving')}
        </span>
      )}
      <KpiTile
        label={t('revenue')}
        subtitle={t('year', { n: year })}
        value={<CurrencyDisplay amount={revenue} currency_code={currencyCode} locale={locale} />}
        accent="emerald"
        icon={<ArrowUpRight className="h-4 w-4" />}
      />
      <KpiTile
        label={t('expenditure')}
        subtitle={t('year', { n: year })}
        value={
          <CurrencyDisplay amount={expenditure} currency_code={currencyCode} locale={locale} />
        }
        accent={isOverspend ? 'red' : 'sky'}
        icon={<ArrowDownRight className="h-4 w-4" />}
      />
      <KpiTile
        label={t('net')}
        subtitle={t('year', { n: year })}
        value={<CurrencyDisplay amount={net} currency_code={currencyCode} locale={locale} />}
        accent={net >= 0 ? 'emerald' : 'red'}
        icon={<Coins className="h-4 w-4" />}
      />
      <KpiTile
        label={t('perPupil')}
        subtitle={
          perPupil
            ? `${formatCompactCurrency(perPupil.revenue_per_student, locale, currencyCode)} / ${formatCompactCurrency(perPupil.expenditure_per_student, locale, currencyCode)}`
            : '—'
        }
        value={
          perPupil ? (
            <CurrencyDisplay
              amount={perPupil.net_per_student}
              currency_code={currencyCode}
              locale={locale}
            />
          ) : (
            '—'
          )
        }
        accent="violet"
        icon={<Users className="h-4 w-4" />}
      />
    </section>
  );
}

interface TileProps {
  label: string;
  subtitle: string;
  value: React.ReactNode;
  accent: 'emerald' | 'sky' | 'red' | 'violet';
  icon: React.ReactNode;
}

const ACCENT_CLASSES: Record<TileProps['accent'], string> = {
  emerald: 'bg-emerald-100 text-emerald-700',
  sky: 'bg-sky-100 text-sky-700',
  red: 'bg-red-100 text-red-700',
  violet: 'bg-violet-100 text-violet-700',
};

function KpiTile({ label, subtitle, value, accent, icon }: TileProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">
          {label}
        </span>
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full ${ACCENT_CLASSES[accent]}`}
        >
          {icon}
        </span>
      </div>
      <p className="truncate font-mono text-xl font-semibold text-text-primary">{value}</p>
      <p className="text-xs text-text-tertiary">{subtitle}</p>
    </div>
  );
}

function formatCompactCurrency(amount: number, locale: string, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(amount);
  } catch {
    return amount.toLocaleString(locale);
  }
}
