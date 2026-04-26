'use client';

import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import type { ScenarioColumn } from './compare-kpi-strip';

interface Props {
  columns: ScenarioColumn[];
  currencyCode: string;
  locale: string;
}

export function CompareChart({ columns, currencyCode, locale }: Props) {
  const t = useTranslations('financeBudgetingCompare.chart');

  const data = columns.map((c) => ({
    name: c.name,
    revenue: c.totals.revenue,
    expenditure: c.totals.expenditure,
    net: c.totals.net_result,
  }));

  const compactFormatter = new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
  const fullFormatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
  });

  return (
    <section
      className="rounded-2xl border border-border bg-surface p-4"
      aria-label={t('ariaLabel')}
    >
      <div className="h-[280px] w-full sm:h-[360px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis
              tick={{ fontSize: 12 }}
              tickFormatter={(v: number) => compactFormatter.format(v)}
            />
            <Tooltip
              formatter={(v) => (typeof v === 'number' ? fullFormatter.format(v) : String(v ?? ''))}
              labelStyle={{ fontWeight: 600 }}
            />
            <Legend />
            <Bar dataKey="revenue" name={t('legendRevenue')} fill="#10b981" />
            <Bar dataKey="expenditure" name={t('legendExpenditure')} fill="#ef4444" />
            <Bar dataKey="net" name={t('legendNet')} fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
