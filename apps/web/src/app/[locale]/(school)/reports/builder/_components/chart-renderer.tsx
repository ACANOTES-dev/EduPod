'use client';

import * as React from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

import type { QueryExecutionResult } from '@school/shared/reports';

import type { SavedReportChartType } from './builder-types';

interface ChartRendererProps {
  chartType: Exclude<SavedReportChartType, 'table'>;
  result: QueryExecutionResult;
  xAxisFieldId: string | null;
  yAxisFieldId: string | null;
  kpiFieldId: string | null;
}

const CHART_COLOURS = ['#6366f1', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#0ea5e9', '#a855f7', '#f97316', '#22c55e'];

export function ChartRenderer({ chartType, result, xAxisFieldId, yAxisFieldId, kpiFieldId }: ChartRendererProps) {
  if (chartType === 'kpi') return <KpiChart result={result} kpiFieldId={kpiFieldId} />;
  if (!xAxisFieldId || !yAxisFieldId) return null;

  const data = result.rows.map((row) => ({
    label: String(row[xAxisFieldId] ?? ''),
    value: toNumber(row[yAxisFieldId]),
  }));

  if (chartType === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 11 }} />
          <YAxis className="text-xs" tick={{ fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="value" fill={CHART_COLOURS[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }
  if (chartType === 'line') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" className="text-xs" tick={{ fontSize: 11 }} />
          <YAxis className="text-xs" tick={{ fontSize: 11 }} />
          <Tooltip />
          <Line type="monotone" dataKey="value" stroke={CHART_COLOURS[0]} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if (chartType === 'pie') {
    return (
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={110} label>
            {data.map((_, i) => (<Cell key={i} fill={CHART_COLOURS[i % CHART_COLOURS.length]!} />))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    );
  }
  return null;
}

interface KpiChartProps { result: QueryExecutionResult; kpiFieldId: string | null; }

function KpiChart({ result, kpiFieldId }: KpiChartProps) {
  const value = React.useMemo(() => {
    if (!kpiFieldId) return null;
    const firstRow = result.rows[0];
    if (!firstRow) return null;
    const raw = firstRow[kpiFieldId];
    return raw === null || raw === undefined ? null : raw;
  }, [result, kpiFieldId]);
  if (value === null) return null;
  const display = typeof value === 'number' ? value.toLocaleString() : String(value);
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border bg-surface p-12">
      <p className="text-6xl font-bold text-primary">{display}</p>
      <p className="text-xs text-text-tertiary">{kpiFieldId.split('.').slice(-1)[0]}</p>
    </div>
  );
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}
