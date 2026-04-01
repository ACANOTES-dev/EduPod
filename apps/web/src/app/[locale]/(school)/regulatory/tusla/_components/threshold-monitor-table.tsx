'use client';

import { useTranslations } from 'next-intl';
import * as React from 'react';

import { StatusBadge, cn } from '@school/ui';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ThresholdStudent {
  student: {
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
  };
  absent_days: number;
  threshold: number;
  status: 'normal' | 'approaching' | 'exceeded';
}

interface ThresholdMonitorTableProps {
  data: ThresholdStudent[];
  threshold: number;
  isLoading: boolean;
}

// ─── Status Variant Map ─────────────────────────────────────────────────────

const statusVariant: Record<string, 'success' | 'warning' | 'danger'> = {
  normal: 'success',
  approaching: 'warning',
  exceeded: 'danger',
};

// ─── Absent Days Colour ─────────────────────────────────────────────────────

function absentDaysClass(days: number): string {
  if (days >= 20) return 'text-danger-text font-semibold';
  if (days >= 15) return 'text-warning-text font-medium';
  return 'text-success-text';
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl bg-surface-secondary p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-4 w-40 rounded bg-border" />
              <div className="h-3 w-24 rounded bg-border" />
            </div>
            <div className="h-6 w-20 rounded bg-border" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ThresholdMonitorTable({ data, threshold, isLoading }: ThresholdMonitorTableProps) {
  const t = useTranslations('regulatory');

  if (isLoading) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-text-primary">{t('tusla.thresholdMonitor')}</h2>
        <p className="mt-1 text-sm text-text-tertiary">{t('tusla.thresholdMonitorDescription')}</p>
        <div className="mt-4">
          <TableSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">{t('tusla.thresholdMonitor')}</h2>
          <p className="mt-1 text-sm text-text-tertiary">
            {t('tusla.thresholdMonitorDescription')}
          </p>
        </div>
        <span className="text-xs text-text-tertiary">
          {t('tusla.thresholdDays', { days: threshold })}
        </span>
      </div>

      {data.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-border px-4 py-10 text-center">
          <p className="text-sm text-text-tertiary">{t('tusla.noStudentsNearThreshold')}</p>
        </div>
      ) : (
        <>
          {/* ─── Mobile cards ─────────────────────────────────────────────── */}
          <div className="mt-4 space-y-3 md:hidden">
            {data.map((row) => (
              <div
                key={row.student.id}
                className="rounded-2xl border border-border bg-surface px-4 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-text-primary">
                    {row.student.first_name} {row.student.last_name}
                  </p>
                  <StatusBadge status={statusVariant[row.status] ?? 'neutral'} dot>
                    {t(`tusla.status.${row.status}` as never)}
                  </StatusBadge>
                </div>
                {row.student.student_number && (
                  <p className="mt-1 text-xs text-text-tertiary">{row.student.student_number}</p>
                )}
                <div className="mt-3 flex items-center gap-4">
                  <span className="text-xs text-text-tertiary">{t('tusla.absentDays')}:</span>
                  <span className={cn('text-sm tabular-nums', absentDaysClass(row.absent_days))}>
                    {row.absent_days}
                  </span>
                  <span className="text-xs text-text-tertiary">/ {row.threshold}</span>
                </div>
              </div>
            ))}
          </div>

          {/* ─── Desktop table ────────────────────────────────────────────── */}
          <div className="mt-4 hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-text-tertiary">
                  <th className="px-3 py-3 text-start text-xs font-medium uppercase tracking-wider">
                    {t('tusla.studentName')}
                  </th>
                  <th className="px-3 py-3 text-start text-xs font-medium uppercase tracking-wider">
                    {t('tusla.studentNumber')}
                  </th>
                  <th className="px-3 py-3 text-start text-xs font-medium uppercase tracking-wider">
                    {t('tusla.absentDays')}
                  </th>
                  <th className="px-3 py-3 text-start text-xs font-medium uppercase tracking-wider">
                    {t('tusla.threshold')}
                  </th>
                  <th className="px-3 py-3 text-start text-xs font-medium uppercase tracking-wider">
                    {t('tusla.status.label')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((row) => (
                  <tr key={row.student.id} className="hover:bg-surface-secondary transition-colors">
                    <td className="px-3 py-3 text-text-primary font-medium">
                      {row.student.first_name} {row.student.last_name}
                    </td>
                    <td className="px-3 py-3 text-text-secondary tabular-nums">
                      {row.student.student_number ?? '—'}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      <span className={absentDaysClass(row.absent_days)}>{row.absent_days}</span>
                    </td>
                    <td className="px-3 py-3 text-text-secondary tabular-nums">{row.threshold}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={statusVariant[row.status] ?? 'neutral'} dot>
                        {t(`tusla.status.${row.status}` as never)}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
