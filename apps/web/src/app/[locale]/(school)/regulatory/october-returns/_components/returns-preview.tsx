'use client';

import { StatCard } from '@school/ui';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { formatDateTime } from '@/lib/format-date';

// ─── Types ──────────────────────────────────────────────────────────────────

interface NationalityEntry {
  nationality: string;
  count: number;
}

interface YearGroupEntry {
  year_group: string;
  count: number;
}

interface OctoberPreviewResponse {
  academic_year: string;
  generated_at: string;
  summary: {
    total_students: number;
    gender: { male: number; female: number; other: number };
    nationalities: NationalityEntry[];
    year_groups: YearGroupEntry[];
    new_entrants: number;
  };
}

interface ReturnsPreviewProps {
  data: OctoberPreviewResponse | null;
  isLoading: boolean;
}

// ─── Skeletons ──────────────────────────────────────────────────────────────

function StatCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl bg-surface-secondary p-5">
      <div className="h-3 w-20 rounded bg-border" />
      <div className="mt-3 h-7 w-16 rounded bg-border" />
    </div>
  );
}

function TableSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface-primary">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3">
              <div className="h-3 w-24 animate-pulse rounded bg-border" />
            </th>
            <th className="px-4 py-3">
              <div className="h-3 w-16 animate-pulse rounded bg-border" />
            </th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, i) => (
            <tr key={`skel-${i}`} className="border-b border-border last:border-b-0">
              <td className="px-4 py-3">
                <div className="h-4 w-3/4 animate-pulse rounded bg-surface-secondary" />
              </td>
              <td className="px-4 py-3">
                <div className="h-4 w-12 animate-pulse rounded bg-surface-secondary" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Component ──────────────────────────────────────────────────────────────

export function ReturnsPreview({ data, isLoading }: ReturnsPreviewProps) {
  const t = useTranslations('regulatory');

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-4 w-48 animate-pulse rounded bg-border" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <TableSkeleton />
        <TableSkeleton />
      </div>
    );
  }

  if (!data) {
    return (
      <p className="text-sm text-text-secondary">
        {t('octoberReturns.noData')}
      </p>
    );
  }

  const { summary } = data;
  const sortedNationalities = [...summary.nationalities].sort(
    (a, b) => b.count - a.count,
  );
  const sortedYearGroups = [...summary.year_groups].sort((a, b) =>
    a.year_group.localeCompare(b.year_group),
  );

  return (
    <div className="space-y-6">
      {/* ─── Generated Timestamp ─────────────────────────────────────── */}
      <p className="text-xs text-text-tertiary">
        {t('octoberReturns.generatedAt')}:{' '}
        {formatDateTime(data.generated_at)}
      </p>

      {/* ─── Summary Stat Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label={t('octoberReturns.totalStudents')}
          value={summary.total_students}
        />
        <StatCard
          label={t('octoberReturns.genderMale')}
          value={summary.gender.male}
        />
        <StatCard
          label={t('octoberReturns.genderFemale')}
          value={summary.gender.female}
        />
        <StatCard
          label={t('octoberReturns.genderOther')}
          value={summary.gender.other}
        />
        <StatCard
          label={t('octoberReturns.newEntrants')}
          value={summary.new_entrants}
        />
      </div>

      {/* ─── Nationality Breakdown ───────────────────────────────────── */}
      <div>
        <h3 className="mb-3 text-base font-semibold text-text-primary">
          {t('octoberReturns.nationalityBreakdown')}
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface-primary">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('octoberReturns.nationality')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('octoberReturns.count')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedNationalities.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-8 text-center text-sm text-text-tertiary"
                  >
                    {t('octoberReturns.noData')}
                  </td>
                </tr>
              ) : (
                sortedNationalities.map((entry) => (
                  <tr
                    key={entry.nationality}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-4 py-3 text-sm text-text-primary">
                      {entry.nationality}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {entry.count}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Year Group Breakdown ────────────────────────────────────── */}
      <div>
        <h3 className="mb-3 text-base font-semibold text-text-primary">
          {t('octoberReturns.yearGroupBreakdown')}
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-border bg-surface-primary">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('octoberReturns.yearGroup')}
                </th>
                <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                  {t('octoberReturns.count')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedYearGroups.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-8 text-center text-sm text-text-tertiary"
                  >
                    {t('octoberReturns.noData')}
                  </td>
                </tr>
              ) : (
                sortedYearGroups.map((entry) => (
                  <tr
                    key={entry.year_group}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-4 py-3 text-sm text-text-primary">
                      {entry.year_group}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">
                      {entry.count}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
