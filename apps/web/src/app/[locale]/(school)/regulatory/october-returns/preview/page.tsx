'use client';

import { Download } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import { Button, Input, Label, StatCard } from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format-date';

import { ErrorBanner } from '../../_components/error-banner';

// ─── Types ──────────────────────────────────────────────────────────────────

interface OctoberPreviewResponse {
  academic_year: string;
  generated_at: string;
  summary: {
    total_students: number;
    gender: { male: number; female: number; other: number };
    nationalities: Array<{ nationality: string; count: number }>;
    year_groups: Array<{ year_group: string; count: number }>;
    new_entrants: number;
  };
}

const DEFAULT_ACADEMIC_YEAR = '2025-2026';

// ─── Envelope helper ─────────────────────────────────────────────────────────

function unwrap<T>(res: { data: T } | T): T {
  if (res && typeof res === 'object' && 'data' in (res as object)) {
    return (res as { data: T }).data;
  }
  return res as T;
}

// ─── CSV helpers ─────────────────────────────────────────────────────────────

function escapeCsv(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function buildCsv(preview: OctoberPreviewResponse): string {
  const lines: string[] = [];
  lines.push(`Section,Key,Value`);
  lines.push(`Summary,Academic Year,${escapeCsv(preview.academic_year)}`);
  lines.push(`Summary,Generated At,${escapeCsv(preview.generated_at)}`);
  lines.push(`Summary,Total Students,${preview.summary.total_students}`);
  lines.push(`Summary,New Entrants,${preview.summary.new_entrants}`);
  lines.push(`Gender,Male,${preview.summary.gender.male}`);
  lines.push(`Gender,Female,${preview.summary.gender.female}`);
  lines.push(`Gender,Other,${preview.summary.gender.other}`);
  for (const n of preview.summary.nationalities) {
    lines.push(`Nationality,${escapeCsv(n.nationality)},${n.count}`);
  }
  for (const yg of preview.summary.year_groups) {
    lines.push(`Year Group,${escapeCsv(yg.year_group)},${yg.count}`);
  }
  return lines.join('\n');
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function OctoberReturnsPreviewPage() {
  const t = useTranslations('regulatory.octoberReturns');
  const locale = useLocale();
  const searchParams = useSearchParams();

  const urlYear = searchParams?.get('year');
  const [academicYear, setAcademicYear] = React.useState<string>(urlYear ?? DEFAULT_ACADEMIC_YEAR);
  const [draftYear, setDraftYear] = React.useState<string>(urlYear ?? DEFAULT_ACADEMIC_YEAR);

  const [preview, setPreview] = React.useState<OctoberPreviewResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [fetchError, setFetchError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setFetchError(null);

    apiClient<{ data: OctoberPreviewResponse } | OctoberPreviewResponse>(
      `/api/v1/regulatory/october-returns/preview?academic_year=${encodeURIComponent(academicYear)}`,
      { silent: true },
    )
      .then((res) => {
        if (cancelled) return;
        setPreview(unwrap(res));
      })
      .catch((err) => {
        console.error('[OctoberReturnsPreviewPage] fetch failed', err);
        if (!cancelled) {
          setPreview(null);
          setFetchError(t('loadError'));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [academicYear, reloadKey, t]);

  function handleApplyYear() {
    const trimmed = draftYear.trim();
    if (trimmed && trimmed !== academicYear) setAcademicYear(trimmed);
  }

  function handleYearKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') handleApplyYear();
  }

  function handleDownload() {
    if (!preview) return;
    const filename = `october-returns-${preview.academic_year}.csv`;
    downloadCsv(filename, buildCsv(preview));
  }

  const sortedNationalities = React.useMemo(
    () => (preview ? [...preview.summary.nationalities].sort((a, b) => b.count - a.count) : []),
    [preview],
  );
  const sortedYearGroups = React.useMemo(
    () =>
      preview
        ? [...preview.summary.year_groups].sort((a, b) => {
            if (a.year_group === 'Unassigned') return 1;
            if (b.year_group === 'Unassigned') return -1;
            return a.year_group.localeCompare(b.year_group);
          })
        : [],
    [preview],
  );

  return (
    <div className="flex min-w-0 flex-col gap-6 pb-10">
      <PageHeader
        title={t('preview.pageTitle')}
        description={t('preview.pageDescription')}
        back={{ href: `/${locale}/regulatory/october-returns`, label: t('backToHub') }}
        actions={
          <Button
            onClick={handleDownload}
            disabled={!preview || isLoading}
            className="min-h-[44px] bg-teal-600 text-white hover:bg-teal-700"
          >
            <Download className="me-1.5 h-4 w-4" aria-hidden="true" />
            {t('preview.downloadCsv')}
          </Button>
        }
      />

      {fetchError && (
        <ErrorBanner
          message={fetchError}
          retryLabel={t('retry')}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      )}

      {/* ── Academic year selector ─────────────────────────────────────── */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border bg-surface-primary p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="october-preview-year">{t('academicYear')}</Label>
          <Input
            id="october-preview-year"
            value={draftYear}
            onChange={(e) => setDraftYear(e.target.value)}
            onKeyDown={handleYearKeyDown}
            placeholder={t('academicYearPlaceholder')}
            className="w-full text-base sm:w-44"
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleApplyYear}
          disabled={isLoading || draftYear.trim() === academicYear}
          className="min-h-[44px]"
        >
          {t('applyYear')}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-border/60" />
            ))}
          </div>
          <div className="h-48 animate-pulse rounded-2xl bg-border/60" />
          <div className="h-48 animate-pulse rounded-2xl bg-border/60" />
        </div>
      ) : !preview ? (
        <div className="rounded-2xl border border-border bg-surface-secondary p-8 text-center text-sm text-text-secondary">
          {t('preview.empty')}
        </div>
      ) : (
        <>
          <p className="text-xs text-text-tertiary">
            {t('preview.generatedAt')}: {formatDateTime(preview.generated_at)}
          </p>

          {/* ── Summary cards ────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label={t('totalStudents')} value={preview.summary.total_students} />
            <StatCard label={t('genderMale')} value={preview.summary.gender.male} />
            <StatCard label={t('genderFemale')} value={preview.summary.gender.female} />
            <StatCard label={t('genderOther')} value={preview.summary.gender.other} />
            <StatCard label={t('newEntrants')} value={preview.summary.new_entrants} />
          </div>

          {/* ── Nationality table ────────────────────────────────────────── */}
          <div>
            <h3 className="mb-3 text-base font-semibold text-text-primary">
              {t('nationalityBreakdown')}
            </h3>
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface-primary">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary">
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      {t('nationality')}
                    </th>
                    <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      {t('count')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedNationalities.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-sm text-text-tertiary">
                        {t('noData')}
                      </td>
                    </tr>
                  ) : (
                    sortedNationalities.map((entry) => (
                      <tr key={entry.nationality}>
                        <td className="px-4 py-3 text-sm text-text-primary">{entry.nationality}</td>
                        <td className="px-4 py-3 text-end text-sm font-medium text-text-primary">
                          {entry.count}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Year group table ─────────────────────────────────────────── */}
          <div>
            <h3 className="mb-3 text-base font-semibold text-text-primary">
              {t('yearGroupBreakdown')}
            </h3>
            <div className="overflow-x-auto rounded-2xl border border-border bg-surface-primary">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-surface-secondary">
                    <th className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      {t('yearGroup')}
                    </th>
                    <th className="px-4 py-3 text-end text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      {t('count')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedYearGroups.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-sm text-text-tertiary">
                        {t('noData')}
                      </td>
                    </tr>
                  ) : (
                    sortedYearGroups.map((entry) => (
                      <tr key={entry.year_group}>
                        <td className="px-4 py-3 text-sm text-text-primary">{entry.year_group}</td>
                        <td className="px-4 py-3 text-end text-sm font-medium text-text-primary">
                          {entry.count}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
