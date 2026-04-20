'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({
  data,
  stroke,
  height = 32,
  width = 120,
}: {
  data: number[];
  stroke: string;
  height?: number;
  width?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = width / Math.max(data.length - 1, 1);
  const points = data
    .map((v, i) => `${i * step},${height - ((v - min) / range) * height}`)
    .join(' ');
  const areaPoints = `0,${height} ${points} ${(data.length - 1) * step},${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="overflow-visible"
      aria-hidden="true"
    >
      <polygon points={areaPoints} fill={stroke} opacity="0.1" />
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Large KPI Tile ──────────────────────────────────────────────────────────

export type KpiSeverity = 'red' | 'amber' | 'green' | 'blue' | 'neutral';

const SEVERITY_CLASSES: Record<
  KpiSeverity,
  {
    border: string;
    iconBg: string;
    iconText: string;
    accent: string;
    sparkStroke: string;
  }
> = {
  red: {
    border: 'border-s-4 border-s-rose-500',
    iconBg: 'bg-rose-100',
    iconText: 'text-rose-700',
    accent: 'text-rose-700',
    sparkStroke: '#e11d48',
  },
  amber: {
    border: 'border-s-4 border-s-amber-500',
    iconBg: 'bg-amber-100',
    iconText: 'text-amber-700',
    accent: 'text-amber-700',
    sparkStroke: '#d97706',
  },
  green: {
    border: 'border-s-4 border-s-emerald-500',
    iconBg: 'bg-emerald-100',
    iconText: 'text-emerald-700',
    accent: 'text-emerald-700',
    sparkStroke: '#059669',
  },
  blue: {
    border: 'border-s-4 border-s-sky-500',
    iconBg: 'bg-sky-100',
    iconText: 'text-sky-700',
    accent: 'text-sky-700',
    sparkStroke: '#0284c7',
  },
  neutral: {
    border: 'border-s-4 border-s-slate-300',
    iconBg: 'bg-slate-100',
    iconText: 'text-slate-700',
    accent: 'text-slate-700',
    sparkStroke: '#475569',
  },
};

interface KpiLargeTileProps {
  icon: LucideIcon;
  label: string;
  value: number | string | undefined;
  subtitle?: string;
  severity: KpiSeverity;
  isLoading: boolean;
  href?: string;
  sparkline?: number[];
  delta?: {
    direction: 'up' | 'down' | 'flat';
    label: string;
  };
}

export function KpiLargeTile({
  icon: Icon,
  label,
  value,
  subtitle,
  severity,
  isLoading,
  href,
  sparkline,
  delta,
}: KpiLargeTileProps) {
  const cls = SEVERITY_CLASSES[severity];
  const base =
    'group relative flex min-w-0 flex-col gap-4 overflow-hidden rounded-3xl border border-border bg-surface p-5 shadow-sm transition-all hover:border-border-strong hover:shadow-md';

  const inner = (
    <>
      <div className={`pointer-events-none absolute inset-y-0 start-0 w-1 ${cls.border}`} />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ring-1 ring-inset ring-black/5 ${cls.iconBg} ${cls.iconText}`}
          >
            <Icon className="h-4 w-4" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            {label}
          </span>
        </div>
        {delta && !isLoading && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              delta.direction === 'up'
                ? 'bg-rose-50 text-rose-700'
                : delta.direction === 'down'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            {delta.direction === 'up' && '▲'}
            {delta.direction === 'down' && '▼'}
            {delta.direction === 'flat' && '•'} {delta.label}
          </span>
        )}
      </div>
      {isLoading || value === undefined ? (
        <div className="mt-1 h-10 w-20 animate-pulse rounded bg-border/60" />
      ) : (
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className={`text-[36px] font-bold leading-none tracking-tight ${cls.accent}`}>
              {value}
            </span>
            {subtitle && <span className="mt-1 text-xs text-text-tertiary">{subtitle}</span>}
          </div>
          {sparkline && sparkline.length >= 2 && (
            <div className="shrink-0 pb-1 opacity-70 transition-opacity group-hover:opacity-100">
              <Sparkline data={sparkline} stroke={cls.sparkStroke} />
            </div>
          )}
        </div>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {inner}
      </Link>
    );
  }
  return <div className={base}>{inner}</div>;
}
