'use client';

import { useTranslations } from 'next-intl';

import type { EventEngineOutputs } from '@school/shared/budgeting';

import { CurrencyDisplay } from '../../../../_components/currency-display';

import { useAnimatedNumber } from './use-animated-number';

interface Props {
  output: EventEngineOutputs;
  currencyCode: string;
  locale: string;
  participantCount: number;
  householdCount: number;
}

export function EventOutputCard({
  output,
  currencyCode,
  locale,
  participantCount,
  householdCount,
}: Props) {
  const t = useTranslations('financeBudgetingEventBudgets.outputCard');
  const totalCost = useAnimatedNumber(output.total_cost);
  const perStudent = useAnimatedNumber(output.per_student_cost);
  const perHousehold = useAnimatedNumber(output.per_household_cost);
  const subsidy = useAnimatedNumber(output.school_subsidy_amount);

  const breakeven = output.breakeven_participants;

  return (
    <section
      className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-sm md:sticky md:top-24"
      aria-label={t('ariaLabel')}
    >
      <div>
        <p className="text-xs uppercase tracking-wide text-text-tertiary">{t('totalCost')}</p>
        <p
          dir="ltr"
          className="mt-1 font-mono text-3xl font-semibold tabular-nums text-text-primary"
        >
          <CurrencyDisplay amount={totalCost} currency_code={currencyCode} locale={locale} />
        </p>
        <p className="mt-1 text-xs text-text-tertiary">
          {t('contingencyCaption', {
            pct: output.contingency_amount > 0 ? '5' : '0',
            students: participantCount,
          })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label={t('perStudent')}
          value={perStudent}
          currencyCode={currencyCode}
          locale={locale}
          placeholder={participantCount === 0 ? t('participantPlaceholder') : null}
        />
        <Stat
          label={t('perHousehold')}
          value={perHousehold}
          currencyCode={currencyCode}
          locale={locale}
          placeholder={householdCount === 0 ? t('householdPlaceholder') : null}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <BreakevenStat
          label={t('breakeven')}
          value={breakeven}
          placeholder={breakeven === null ? t('breakevenPlaceholder') : null}
        />
        <Stat
          label={t('schoolSubsidy')}
          value={subsidy}
          currencyCode={currencyCode}
          locale={locale}
          placeholder={null}
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  currencyCode,
  locale,
  placeholder,
}: {
  label: string;
  value: number;
  currencyCode: string;
  locale: string;
  placeholder: string | null;
}) {
  return (
    <div role="group">
      <p className="text-xs uppercase tracking-wide text-text-tertiary">{label}</p>
      {placeholder ? (
        <p className="mt-1 text-xs text-text-secondary">{placeholder}</p>
      ) : (
        <p
          dir="ltr"
          className="mt-1 font-mono text-base font-semibold tabular-nums text-text-primary"
        >
          <CurrencyDisplay amount={value} currency_code={currencyCode} locale={locale} />
        </p>
      )}
    </div>
  );
}

function BreakevenStat({
  label,
  value,
  placeholder,
}: {
  label: string;
  value: number | null;
  placeholder: string | null;
}) {
  return (
    <div role="group">
      <p className="text-xs uppercase tracking-wide text-text-tertiary">{label}</p>
      {placeholder ? (
        <p className="mt-1 text-xs text-text-secondary">{placeholder}</p>
      ) : (
        <p
          dir="ltr"
          className="mt-1 font-mono text-base font-semibold tabular-nums text-text-primary"
        >
          {value ?? 0}
        </p>
      )}
    </div>
  );
}
