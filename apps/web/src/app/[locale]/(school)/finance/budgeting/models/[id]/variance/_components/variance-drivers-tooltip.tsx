'use client';

import { useTranslations } from 'next-intl';

import { CurrencyDisplay } from '../../../../../_components/currency-display';

import type { VarianceRow } from './variance-types';

interface Props {
  row: VarianceRow;
  currencyCode: string;
  locale: string;
}

interface TuitionDriversJson {
  enrollment_delta_amount?: number;
  enrollment_delta_students?: number;
  fee_delta_amount?: number;
  fee_delta_pct?: number;
  discount_delta_amount?: number;
  discount_delta_pct?: number;
  other_amount?: number;
  year_group?: string;
}

const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/**
 * Read the tuition drivers JSON. Variance worker (impl 08) populates
 * `drivers_json` for tuition rows with the breakdown shape; non-tuition
 * rows have the `manual: true` marker (manual actuals) or `null` —
 * neither yields a tooltip.
 */
function readTuitionDrivers(drivers: Record<string, unknown> | null): TuitionDriversJson | null {
  if (!drivers) return null;
  // Manual actual entries set `manual: true`; skip those so we don't
  // try to render a numeric breakdown that isn't there.
  if (drivers.manual === true) return null;
  const out: TuitionDriversJson = {};
  if (isFiniteNumber(drivers.enrollment_delta_amount))
    out.enrollment_delta_amount = drivers.enrollment_delta_amount;
  if (isFiniteNumber(drivers.enrollment_delta_students))
    out.enrollment_delta_students = drivers.enrollment_delta_students;
  if (isFiniteNumber(drivers.fee_delta_amount)) out.fee_delta_amount = drivers.fee_delta_amount;
  if (isFiniteNumber(drivers.fee_delta_pct)) out.fee_delta_pct = drivers.fee_delta_pct;
  if (isFiniteNumber(drivers.discount_delta_amount))
    out.discount_delta_amount = drivers.discount_delta_amount;
  if (isFiniteNumber(drivers.discount_delta_pct))
    out.discount_delta_pct = drivers.discount_delta_pct;
  if (isFiniteNumber(drivers.other_amount)) out.other_amount = drivers.other_amount;
  if (typeof drivers.year_group === 'string') out.year_group = drivers.year_group;
  if (Object.keys(out).length === 0) return null;
  return out;
}

export function VarianceDriversTooltip({ row, currencyCode, locale }: Props) {
  const t = useTranslations('financeBudgetingVariance.tooltip');
  const drivers = readTuitionDrivers(row.drivers_json);
  if (!drivers) return null;

  const variance = row.variance;
  const direction = variance < 0 ? 'below' : 'above';

  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-3 text-xs text-text-secondary shadow-md">
      <p className="font-semibold text-text-primary">
        {direction === 'below' ? t('headlineBelow') : t('headlineAbove')}{' '}
        <span dir="ltr" className="font-mono">
          <CurrencyDisplay
            amount={Math.abs(variance)}
            currency_code={currencyCode}
            locale={locale}
          />
        </span>
      </p>
      <ul className="flex flex-col gap-0.5">
        {drivers.enrollment_delta_students !== undefined &&
          drivers.enrollment_delta_amount !== undefined && (
            <li className="flex items-center justify-between gap-3">
              <span>
                {t('enrollment', {
                  yearGroup: drivers.year_group ?? '',
                  students: drivers.enrollment_delta_students,
                })}
              </span>
              <span dir="ltr" className="shrink-0 font-mono">
                <CurrencyDisplay
                  amount={Math.abs(drivers.enrollment_delta_amount)}
                  currency_code={currencyCode}
                  locale={locale}
                />
              </span>
            </li>
          )}
        {drivers.fee_delta_amount !== undefined && drivers.fee_delta_pct !== undefined && (
          <li className="flex items-center justify-between gap-3">
            <span>{t('fee', { pct: drivers.fee_delta_pct.toFixed(1) })}</span>
            <span dir="ltr" className="shrink-0 font-mono">
              <CurrencyDisplay
                amount={Math.abs(drivers.fee_delta_amount)}
                currency_code={currencyCode}
                locale={locale}
              />
            </span>
          </li>
        )}
        {drivers.discount_delta_amount !== undefined &&
          drivers.discount_delta_pct !== undefined && (
            <li className="flex items-center justify-between gap-3">
              <span>{t('discount', { pct: drivers.discount_delta_pct.toFixed(1) })}</span>
              <span dir="ltr" className="shrink-0 font-mono">
                <CurrencyDisplay
                  amount={Math.abs(drivers.discount_delta_amount)}
                  currency_code={currencyCode}
                  locale={locale}
                />
              </span>
            </li>
          )}
        {drivers.other_amount !== undefined && (
          <li className="flex items-center justify-between gap-3">
            <span>{t('other')}</span>
            <span dir="ltr" className="shrink-0 font-mono">
              <CurrencyDisplay
                amount={Math.abs(drivers.other_amount)}
                currency_code={currencyCode}
                locale={locale}
              />
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
