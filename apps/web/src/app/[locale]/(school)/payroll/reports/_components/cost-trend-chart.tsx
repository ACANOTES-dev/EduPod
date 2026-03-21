'use client';

import { Button } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';


function formatCurrency(value: number): string {
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

interface CostTrendPoint {
  period_month: number;
  period_year: number;
  period_label: string;
  total_pay: number;
  total_basic_pay: number;
  total_bonus_pay: number;
  headcount: number;
}

interface CostTrendChartProps {
  data: CostTrendPoint[];
  onPointClick?: (point: CostTrendPoint) => void;
}

interface TooltipPayloadEntry {
  name: string;
  value: number;
  color: string;
}

export function CostTrendChart({ data, onPointClick }: CostTrendChartProps) {
  const t = useTranslations('payroll');
  const [stacked, setStacked] = React.useState(true);

  const CustomTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: TooltipPayloadEntry[];
    label?: string;
  }) => {
    if (!active || !payload?.length) return null;
    const point = data.find((d) => d.period_label === label);
    return (
      <div className="rounded-xl border border-border bg-surface p-3 shadow-lg">
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        {payload.map((entry) => (
          <p key={entry.name} className="text-xs" style={{ color: entry.color }}>
            {entry.name}: {formatCurrency(entry.value)}
          </p>
        ))}
        {point && (
          <p className="mt-1 text-xs text-text-tertiary">
            {t('headcount')}: {point.headcount}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-text-primary">{t('costTrend')}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStacked(!stacked)}
        >
          {stacked ? 'Unstacked' : 'Stacked'}
        </Button>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <AreaChart
          data={data}
          onClick={(e: Record<string, unknown> | null) => {
            const payload = (e as { activePayload?: Array<{ payload: CostTrendPoint }> } | null)
              ?.activePayload?.[0]?.payload;
            if (payload && onPointClick) {
              onPointClick(payload);
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="period_label"
            tick={{ fontSize: 12 }}
            stroke="var(--color-text-tertiary)"
          />
          <YAxis
            tickFormatter={(v: number) => formatCurrency(v)}
            tick={{ fontSize: 12 }}
            stroke="var(--color-text-tertiary)"
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Area
            type="monotone"
            dataKey="total_basic_pay"
            name={t('basicPay')}
            stackId={stacked ? '1' : undefined}
            stroke="hsl(var(--color-primary))"
            fill="hsl(var(--color-primary) / 0.3)"
          />
          <Area
            type="monotone"
            dataKey="total_bonus_pay"
            name={t('bonusPay')}
            stackId={stacked ? '1' : undefined}
            stroke="hsl(var(--color-success))"
            fill="hsl(var(--color-success) / 0.3)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
