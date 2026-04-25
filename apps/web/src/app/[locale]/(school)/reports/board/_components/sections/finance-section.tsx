'use client';

import { useTranslations } from 'next-intl';

import type { FinanceSection as FinanceSectionData } from '@school/shared/reports';

interface FinanceSectionProps {
  section: FinanceSectionData;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  ZAR: 'R',
  AED: 'د.إ',
};

export function FinanceSection({ section }: FinanceSectionProps) {
  const t = useTranslations('reports');

  const symbol = CURRENCY_SYMBOLS[section.currency_code] ?? `${section.currency_code} `;
  const collectionRate = section.collection_rate_pct;

  const formatCurrency = (amount: number): string => {
    if (Math.abs(amount) >= 1000) {
      return `${symbol}${(amount / 1000).toFixed(1)}k`;
    }
    return `${symbol}${amount.toFixed(2)}`;
  };

  const collectionColour =
    collectionRate > 80 ? 'bg-emerald-500' : collectionRate > 50 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <section className="space-y-6 rounded-xl border border-border bg-surface p-6">
      <h3 className="text-lg font-semibold text-text-primary">{t('board.section.finance')}</h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Collection rate gauge */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.collectionRate')}</h4>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold text-text-primary">
                {collectionRate.toFixed(1)}%
              </span>
              <span className="text-xs text-text-tertiary">{t('board.ofInvoiced')}</span>
            </div>
            <div className="h-4 w-full overflow-hidden rounded-full bg-surface-secondary">
              <div
                className={`h-full transition-all ${collectionColour}`}
                style={{ width: `${Math.min(100, Math.max(0, collectionRate))}%` }}
              />
            </div>
          </div>
        </div>

        {/* Outstanding */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.outstanding')}</h4>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-red-600">
              {formatCurrency(section.overdue_amount)}
            </span>
            <span className="text-sm text-text-tertiary">
              ({section.overdue_count} {t('board.invoices')})
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 md:grid-cols-2">
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.invoicesIssued')}</h4>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-text-primary">
                {section.invoices_issued_count}
              </span>
              <span className="text-sm text-text-tertiary">{t('board.invoices')}</span>
            </div>
            <p className="text-sm text-text-secondary">
              {t('board.totalAmount')}: {formatCurrency(section.total_invoiced_amount)}
            </p>
            <p className="text-sm text-emerald-600">
              {t('board.collected')}: {formatCurrency(section.total_collected_amount)}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <h4 className="text-sm font-medium text-text-primary">{t('board.writeOffs')}</h4>
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-text-primary">
                {section.write_off_count}
              </span>
              <span className="text-sm text-text-tertiary">{t('board.invoices')}</span>
            </div>
            <p className="text-sm text-red-600">{formatCurrency(section.write_off_amount)}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
