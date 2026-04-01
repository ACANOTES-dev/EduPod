'use client';

import { ExternalLink, Users } from 'lucide-react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}

interface SubjectRef {
  id: string;
  name: string;
}

interface CoverageCell {
  subject_id: string;
  in_curriculum: boolean;
  count: number;
  teachers: Array<{ id: string; name: string }>;
}

interface CoverageRow {
  year_group_id: string;
  year_group_name: string;
  cells: CoverageCell[];
}

interface CoverageData {
  subjects: SubjectRef[];
  rows: CoverageRow[];
  summary: {
    gaps: number;
    at_risk: number;
    covered: number;
    total: number;
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompetencyCoveragePage() {
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [coverage, setCoverage] = React.useState<CoverageData | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // Load academic years
  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20')
      .then((res) => {
        setAcademicYears(res.data);
        if (res.data[0]) setSelectedYear(res.data[0].id);
      })
      .catch(() => toast.error(tc('errorGeneric')));
  }, [tc]);

  // Fetch coverage data
  React.useEffect(() => {
    if (!selectedYear) return;
    setIsLoading(true);
    apiClient<{ data: CoverageData }>(
      `/api/v1/scheduling/teacher-competencies/coverage?academic_year_id=${selectedYear}`,
      { silent: true },
    )
      .then((res) => setCoverage(res.data))
      .catch(() => setCoverage(null))
      .finally(() => setIsLoading(false));
  }, [selectedYear]);

  const summary = coverage?.summary ?? { gaps: 0, at_risk: 0, covered: 0, total: 0 };
  const coverageRate =
    summary.total > 0 ? Math.round(((summary.covered + summary.at_risk) / summary.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tv('coverageTitle')}
        description={tv('coverageDesc')}
        actions={
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder={tv('selectAcademicYear')} />
            </SelectTrigger>
            <SelectContent>
              {academicYears.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  {y.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          value={summary.gaps}
          label={tv('coverageGaps')}
          color="text-red-600"
          bg="bg-red-50"
        />
        <KpiCard
          value={summary.at_risk}
          label={tv('coverageAtRisk')}
          color="text-amber-600"
          bg="bg-amber-50"
        />
        <KpiCard
          value={summary.covered}
          label={tv('coverageCovered')}
          color="text-green-600"
          bg="bg-green-50"
        />
        <KpiCard
          value={`${coverageRate}%`}
          label={tv('coverageRate')}
          color="text-primary"
          bg="bg-primary/5"
        />
      </div>

      {/* Heatmap Matrix */}
      {isLoading && (
        <div className="rounded-2xl border border-border px-4 py-12 text-center text-text-tertiary">
          {tc('loading')}
        </div>
      )}

      {!isLoading && coverage && coverage.rows.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-surface-secondary">
                  <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase sticky start-0 bg-surface-secondary z-10 min-w-[140px]">
                    {tv('coverageYearGroup')}
                  </th>
                  {coverage.subjects.map((s) => (
                    <th
                      key={s.id}
                      className="px-2 py-3 text-center text-xs font-medium text-text-tertiary uppercase"
                    >
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coverage.rows.map((row) => (
                  <tr key={row.year_group_id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium text-text-primary sticky start-0 bg-surface z-10 whitespace-nowrap">
                      {row.year_group_name}
                    </td>
                    {row.cells.map((cell) => (
                      <td key={cell.subject_id} className="px-1 py-1 text-center">
                        {cell.in_curriculum ? (
                          <CoveragePopover
                            cell={cell}
                            subjectName={
                              coverage.subjects.find((s) => s.id === cell.subject_id)?.name ?? ''
                            }
                            yearGroupName={row.year_group_name}
                            locale={locale}
                          />
                        ) : (
                          <span className="text-text-tertiary/40">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 border-t border-border bg-surface-secondary/50 px-4 py-2 text-xs text-text-tertiary">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-100" />{' '}
              {tv('coverageLegendGap')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-100" />{' '}
              {tv('coverageLegendAtRisk')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-100" />{' '}
              {tv('coverageLegendCovered')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-surface-secondary" />{' '}
              {tv('coverageLegendNotInCurriculum')}
            </span>
          </div>
        </div>
      )}

      {!isLoading && coverage && coverage.rows.length === 0 && (
        <div className="rounded-2xl border border-border px-4 py-12 text-center text-text-tertiary">
          {tv('coverageNoData')}
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  value,
  label,
  color,
  bg,
}: {
  value: number | string;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <div className={`rounded-xl ${bg} px-4 py-3 text-center`}>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-text-tertiary mt-0.5">{label}</div>
    </div>
  );
}

function CoveragePopover({
  cell,
  subjectName,
  yearGroupName,
  locale,
}: {
  cell: CoverageCell;
  subjectName: string;
  yearGroupName: string;
  locale: string;
}) {
  const tv = useTranslations('scheduling.v2');

  const bgClass =
    cell.count === 0
      ? 'bg-red-100 text-red-800'
      : cell.count === 1
        ? 'bg-amber-100 text-amber-800'
        : 'bg-green-100 text-green-800';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`w-full rounded-md px-1 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 ${bgClass}`}
        >
          {cell.count}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="center">
        <div className="text-sm font-semibold text-text-primary mb-1">
          {yearGroupName} — {subjectName}
        </div>
        {cell.teachers.length === 0 ? (
          <p className="text-xs text-red-600 mb-2">{tv('coverageNoTeachers')}</p>
        ) : (
          <ul className="space-y-1 mb-2">
            {cell.teachers.map((t) => (
              <li key={t.id} className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Users className="h-3 w-3 text-text-tertiary shrink-0" />
                {t.name}
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/${locale}/scheduling/competencies`}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          {tv('coverageEditCompetencies')}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
