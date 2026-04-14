'use client';

import { AlertCircle, ExternalLink, Pin, Users } from 'lucide-react';
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

interface CoverageRow {
  class_id: string;
  class_name: string;
  year_group_id: string;
  year_group_name: string;
  subject_id: string;
  subject_name: string;
  mode: 'pinned' | 'pool' | 'missing';
  eligible_teacher_count: number;
}

interface CoverageResponse {
  rows: CoverageRow[];
  summary: { pinned: number; pool: number; missing: number; total: number };
}

type CellState =
  | { status: 'pinned'; count: number }
  | { status: 'pool'; count: number }
  | { status: 'missing' }
  | { status: 'not_in_curriculum' };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompetencyCoveragePage() {
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');
  const locale = useLocale();

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [coverage, setCoverage] = React.useState<CoverageResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [showOnlyProblems, setShowOnlyProblems] = React.useState(false);

  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20')
      .then((res) => {
        setAcademicYears(res.data);
        if (res.data[0]) setSelectedYear(res.data[0].id);
      })
      .catch((err) => {
        console.error('[CoveragePage.years]', err);
        toast.error(tc('errorGeneric'));
      });
  }, [tc]);

  React.useEffect(() => {
    if (!selectedYear) return;
    setIsLoading(true);
    apiClient<{ data: CoverageResponse }>(
      `/api/v1/scheduling/teacher-competencies/coverage?academic_year_id=${selectedYear}`,
      { silent: true },
    )
      .then((res) => setCoverage(res.data))
      .catch((err) => {
        console.error('[CoveragePage.coverage]', err);
        setCoverage(null);
      })
      .finally(() => setIsLoading(false));
  }, [selectedYear]);

  // ─── Build grid ───────────────────────────────────────────────────────────

  const { classColumns, subjectRows, cellByKey } = React.useMemo(() => {
    if (!coverage) {
      return {
        classColumns: [] as Array<{
          class_id: string;
          class_name: string;
          year_group_id: string;
          year_group_name: string;
        }>,
        subjectRows: [] as Array<{ subject_id: string; subject_name: string }>,
        cellByKey: new Map<string, CellState>(),
      };
    }
    // Classes: unique, grouped by year group (preserving insertion order from API)
    const classMap = new Map<
      string,
      { class_id: string; class_name: string; year_group_id: string; year_group_name: string }
    >();
    const subjMap = new Map<string, { subject_id: string; subject_name: string }>();
    const map = new Map<string, CellState>();

    for (const r of coverage.rows) {
      if (!classMap.has(r.class_id)) {
        classMap.set(r.class_id, {
          class_id: r.class_id,
          class_name: r.class_name,
          year_group_id: r.year_group_id,
          year_group_name: r.year_group_name,
        });
      }
      if (!subjMap.has(r.subject_id)) {
        subjMap.set(r.subject_id, { subject_id: r.subject_id, subject_name: r.subject_name });
      }
      map.set(`${r.class_id}:${r.subject_id}`, {
        status: r.mode,
        count: r.eligible_teacher_count,
      } as CellState);
    }

    // Group classes by year_group_name then class_name
    const classColumns = [...classMap.values()].sort((a, b) => {
      const y = a.year_group_name.localeCompare(b.year_group_name);
      if (y !== 0) return y;
      return a.class_name.localeCompare(b.class_name);
    });
    const subjectRows = [...subjMap.values()].sort((a, b) =>
      a.subject_name.localeCompare(b.subject_name),
    );

    return { classColumns, subjectRows, cellByKey: map };
  }, [coverage]);

  // Year-group-grouped class columns for header grouping
  const yearGroupHeaderGroups = React.useMemo(() => {
    const groups: Array<{ year_group_id: string; year_group_name: string; span: number }> = [];
    for (const c of classColumns) {
      const last = groups[groups.length - 1];
      if (last && last.year_group_id === c.year_group_id) {
        last.span += 1;
      } else {
        groups.push({
          year_group_id: c.year_group_id,
          year_group_name: c.year_group_name,
          span: 1,
        });
      }
    }
    return groups;
  }, [classColumns]);

  const filteredRows = React.useMemo(() => {
    if (!showOnlyProblems) return subjectRows;
    return subjectRows.filter((s) =>
      classColumns.some((c) => {
        const cell = cellByKey.get(`${c.class_id}:${s.subject_id}`);
        return cell?.status === 'missing';
      }),
    );
  }, [subjectRows, classColumns, cellByKey, showOnlyProblems]);

  const summary = coverage?.summary ?? { pinned: 0, pool: 0, missing: 0, total: 0 };
  const coverageRate =
    summary.total > 0 ? Math.round(((summary.pinned + summary.pool) / summary.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={tv('coverageTitle')}
        description={tv('coverageDesc')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
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
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          value={summary.missing}
          label={tv('coverageMissing')}
          color="text-red-600"
          bg="bg-red-50"
        />
        <KpiCard
          value={summary.pool}
          label={tv('coveragePool')}
          color="text-blue-600"
          bg="bg-blue-50"
        />
        <KpiCard
          value={summary.pinned}
          label={tv('coveragePinned')}
          color="text-emerald-600"
          bg="bg-emerald-50"
        />
        <KpiCard
          value={`${coverageRate}%`}
          label={tv('coverageRate')}
          color="text-primary"
          bg="bg-primary/5"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-secondary transition-colors cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={showOnlyProblems}
            onChange={(e) => setShowOnlyProblems(e.target.checked)}
          />
          {tv('coverageShowProblems')}
        </label>
      </div>

      {isLoading && (
        <div className="rounded-2xl border border-border px-4 py-12 text-center text-text-tertiary">
          {tc('loading')}
        </div>
      )}

      {!isLoading && coverage && classColumns.length > 0 && filteredRows.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-surface-secondary">
                  <th
                    rowSpan={2}
                    className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase sticky start-0 bg-surface-secondary z-10 min-w-[180px] align-bottom"
                  >
                    {tv('coverageSubject')}
                  </th>
                  {yearGroupHeaderGroups.map((g) => (
                    <th
                      key={g.year_group_id}
                      colSpan={g.span}
                      className="px-2 py-1.5 text-center text-xs font-medium text-text-tertiary uppercase border-s border-border"
                    >
                      {g.year_group_name}
                    </th>
                  ))}
                </tr>
                <tr className="bg-surface-secondary">
                  {classColumns.map((c) => (
                    <th
                      key={c.class_id}
                      className="px-2 py-1.5 text-center text-xs font-medium text-text-tertiary uppercase"
                    >
                      {c.class_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((s) => (
                  <tr key={s.subject_id} className="border-t border-border">
                    <td className="px-4 py-2 font-medium text-text-primary sticky start-0 bg-surface z-10 whitespace-nowrap">
                      {s.subject_name}
                    </td>
                    {classColumns.map((c) => {
                      const cell =
                        cellByKey.get(`${c.class_id}:${s.subject_id}`) ??
                        ({ status: 'not_in_curriculum' } as CellState);
                      return (
                        <td key={c.class_id} className="px-1 py-1 text-center">
                          <CoverageCell
                            cell={cell}
                            subjectName={s.subject_name}
                            className={c.class_name}
                            locale={locale}
                            t={{
                              pinned: tv('coveragePinned'),
                              pool: tv('coveragePool'),
                              missing: tv('coverageNoTeachers'),
                              eligible: (count: number) => tv('coverageEligibleCount', { count }),
                              edit: tv('coverageEditCompetencies'),
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 border-t border-border bg-surface-secondary/50 px-4 py-2 text-xs text-text-tertiary">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-100 border border-emerald-300" />
              {tv('coverageLegendPinned')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-100 border border-blue-300" />
              {tv('coverageLegendPool')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-red-100 border border-red-300" />
              {tv('coverageLegendMissing')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-surface-secondary" />
              {tv('coverageLegendNotInCurriculum')}
            </span>
          </div>
        </div>
      )}

      {!isLoading && coverage && classColumns.length === 0 && (
        <div className="rounded-2xl border border-border px-4 py-12 text-center text-text-tertiary">
          {tv('coverageNoData')}
        </div>
      )}

      {!isLoading && coverage && classColumns.length > 0 && filteredRows.length === 0 && (
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

function CoverageCell({
  cell,
  subjectName,
  className,
  locale,
  t,
}: {
  cell: CellState;
  subjectName: string;
  className: string;
  locale: string;
  t: {
    pinned: string;
    pool: string;
    missing: string;
    eligible: (count: number) => string;
    edit: string;
  };
}) {
  if (cell.status === 'not_in_curriculum') {
    return <span className="inline-block text-text-tertiary/40">—</span>;
  }

  const cls =
    cell.status === 'pinned'
      ? 'bg-emerald-100 text-emerald-800'
      : cell.status === 'pool'
        ? 'bg-blue-100 text-blue-800'
        : 'bg-red-100 text-red-800';

  const label = cell.status === 'pinned' ? t.pinned : cell.status === 'pool' ? t.pool : t.missing;

  const icon =
    cell.status === 'pinned' ? (
      <Pin className="h-3 w-3" />
    ) : cell.status === 'pool' ? (
      <Users className="h-3 w-3" />
    ) : (
      <AlertCircle className="h-3 w-3" />
    );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center gap-1 w-full rounded-md px-1.5 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 ${cls}`}
        >
          {icon}
          {cell.status !== 'missing' && 'count' in cell && <span>{cell.count}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="center">
        <div className="text-sm font-semibold text-text-primary mb-1">
          {className} — {subjectName}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-secondary mb-2">
          {icon}
          <span>{label}</span>
          {cell.status !== 'missing' && 'count' in cell && <span>· {t.eligible(cell.count)}</span>}
        </div>
        <Link
          href={`/${locale}/scheduling/competencies`}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          {t.edit}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
