'use client';

import { ArrowRight, Users } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';
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

import type { ClassRow, YearGroupRow } from './compute-insights';

interface CohortPanelsProps {
  yearGroups: YearGroupRow[];
  classes: ClassRow[];
  totalFlagged: number;
  isLoading: boolean;
}

export function CohortPanels({ yearGroups, classes, totalFlagged, isLoading }: CohortPanelsProps) {
  const t = useTranslations('earlyWarningsHub.cohort');
  const locale = useLocale();

  return (
    <section
      aria-labelledby="early-warnings-cohort-heading"
      className="flex min-w-0 flex-col gap-4"
    >
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2
            id="early-warnings-cohort-heading"
            className="text-xl font-semibold tracking-tight text-text-primary"
          >
            {t('title')}
          </h2>
          <p className="mt-0.5 text-sm text-text-secondary">{t('description')}</p>
        </div>
        <Link
          href={`/${locale}/early-warnings/cohort`}
          className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          {t('drillIn')}
          <ArrowRight className="h-4 w-4 rtl:rotate-180" />
        </Link>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-3">
        {/* ── By year group (stacked bar chart) ─────────────────────────── */}
        <div className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">{t('byYearGroup')}</h3>
            <span className="text-xs text-text-tertiary">{t('stackedBy')}</span>
          </div>
          {isLoading ? (
            <div className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
          ) : yearGroups.length === 0 ? (
            <EmptyNote label={t('emptyYearGroups')} />
          ) : (
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearGroups} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="year_group"
                    stroke="#6b7280"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                  />
                  <YAxis
                    stroke="#6b7280"
                    fontSize={11}
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(15, 23, 42, 0.04)' }}
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
                  />
                  <Bar dataKey="red" stackId="tier" fill="#e11d48" name={t('red')} />
                  <Bar dataKey="amber" stackId="tier" fill="#d97706" name={t('amber')} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* ── By class (top-10 table) ───────────────────────────────────── */}
        <div className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">{t('byClass')}</h3>
            <span className="text-xs text-text-tertiary">{t('topN', { count: 10 })}</span>
          </div>
          {isLoading ? (
            <div className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
          ) : classes.length === 0 ? (
            <EmptyNote label={t('emptyClasses')} />
          ) : (
            <ul className="space-y-1.5">
              {classes.map((row, i) => (
                <li
                  key={`${row.class_name}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-secondary"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-[11px] font-semibold text-text-secondary">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-text-primary">{row.class_name}</p>
                      {row.year_group && (
                        <p className="truncate text-[11px] text-text-tertiary">{row.year_group}</p>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-semibold text-rose-700">
                    {row.at_risk}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── By composition (anonymised cards) ─────────────────────────── */}
        <div className="min-w-0 rounded-2xl border border-border bg-surface p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary">{t('byComposition')}</h3>
            <span className="text-xs text-text-tertiary">{t('anonymised')}</span>
          </div>
          {isLoading ? (
            <div className="h-48 animate-pulse rounded-xl bg-surface-secondary" />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <CompositionCard
                label={t('compositionTotal')}
                value={totalFlagged}
                icon={<Users className="h-4 w-4" />}
                tint="bg-slate-50 text-slate-800 ring-slate-200"
              />
              <CompositionCard
                label={t('compositionYearGroupsAffected')}
                value={yearGroups.length}
                icon={<span className="text-[11px] font-semibold">YG</span>}
                tint="bg-amber-50 text-amber-800 ring-amber-200"
              />
              <CompositionCard
                label={t('compositionClassesAffected')}
                value={classes.length}
                icon={<span className="text-[11px] font-semibold">CL</span>}
                tint="bg-sky-50 text-sky-800 ring-sky-200"
              />
              <CompositionCard
                label={t('compositionAvgPerClass')}
                value={classes.length === 0 ? '—' : (totalFlagged / classes.length).toFixed(1)}
                icon={<span className="text-[11px] font-semibold">avg</span>}
                tint="bg-rose-50 text-rose-800 ring-rose-200"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function EmptyNote({ label }: { label: string }) {
  return (
    <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border bg-surface-secondary/30 text-xs text-text-tertiary">
      {label}
    </div>
  );
}

function CompositionCard({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  tint: string;
}) {
  return (
    <div className={`flex flex-col gap-1 rounded-xl px-3 py-2.5 ring-1 ring-inset ${tint}`}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <span className="text-2xl font-bold leading-none tracking-tight">{value}</span>
    </div>
  );
}
