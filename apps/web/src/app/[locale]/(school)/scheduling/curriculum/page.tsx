'use client';

import { AlertTriangle, Copy, ExternalLink, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Checkbox,
  Input,
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
interface YearGroup {
  id: string;
  name: string;
}

interface MatrixSubject {
  subject: { id: string; name: string };
  classes: string[];
}

interface ApiCurriculumRow {
  id: string;
  subject_id: string;
  subject?: { id: string; name: string };
  min_periods_per_week: number;
  max_periods_per_day: number;
  preferred_periods_per_week: number | null;
  requires_double_period: boolean;
  double_period_count: number | null;
  period_duration: number | null;
}

interface EditableRow {
  subject_id: string;
  subject_name: string;
  classes: string[];
  existing_id: string | null;
  period_duration: string;
  min_periods_per_week: string;
  max_periods_per_day: string;
  requires_double_period: boolean;
  double_period_count: string;
}

// Default period duration (minutes) when the row has no explicit value.
// Matches the typical period length in the system period grid.
const DEFAULT_PERIOD_DURATION_MIN = 45;

function computeHoursPerWeek(row: EditableRow): number | null {
  const durParsed = parseInt(row.period_duration, 10);
  const dur = Number.isFinite(durParsed) && durParsed > 0 ? durParsed : DEFAULT_PERIOD_DURATION_MIN;
  const min = parseInt(row.min_periods_per_week, 10);
  if (isNaN(min) || min <= 0) return null;
  return (dur * min) / 60;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CurriculumPage() {
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [selectedYearGroup, setSelectedYearGroup] = React.useState('');
  const [totalTeachingPeriods, setTotalTeachingPeriods] = React.useState(0);

  const [rows, setRows] = React.useState<EditableRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [hasMatrixSubjects, setHasMatrixSubjects] = React.useState(true);

  // Load reference data
  React.useEffect(() => {
    Promise.all([
      apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20'),
      apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100'),
    ])
      .then(([yearsRes, ygRes]) => {
        setAcademicYears(yearsRes.data);
        setYearGroups(ygRes.data);
        if (yearsRes.data[0]) setSelectedYear(yearsRes.data[0].id);
        if (ygRes.data[0]) setSelectedYearGroup(ygRes.data[0].id);
      })
      .catch((err) => {
        console.error('[SchedulingCurriculumPage]', err);
        return toast.error(tc('errorGeneric'));
      });
  }, [tc]);

  // Fetch and merge data
  const fetchData = React.useCallback(async () => {
    if (!selectedYear || !selectedYearGroup) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        academic_year_id: selectedYear,
        year_group_id: selectedYearGroup,
      });

      const [matrixRaw, currRes, gridRes] = await Promise.all([
        apiClient<{ data: MatrixSubject[] } | MatrixSubject[]>(
          `/api/v1/scheduling/curriculum-requirements/matrix-subjects?${params.toString()}`,
        ),
        apiClient<{ data: ApiCurriculumRow[] }>(
          `/api/v1/scheduling/curriculum-requirements?${params.toString()}&pageSize=100`,
        ),
        apiClient<
          { total_teaching_periods: number } | { data: { total_teaching_periods: number } }
        >(`/api/v1/period-grid/teaching-count?${params.toString()}`).catch((err) => {
          console.error('[SchedulingCurriculumPage]', err);
          return {
            total_teaching_periods: 0,
          };
        }),
      ]);

      // Handle wrapped response: { data: { total_teaching_periods: N } } or { total_teaching_periods: N }
      const teachingCount =
        'data' in gridRes && typeof gridRes.data === 'object' && gridRes.data !== null
          ? (gridRes.data as { total_teaching_periods: number }).total_teaching_periods
          : (gridRes as { total_teaching_periods: number }).total_teaching_periods;
      setTotalTeachingPeriods(teachingCount ?? 0);

      // Handle response shape — API may wrap in { data: [...] } or return raw array
      const matrixRes: MatrixSubject[] = Array.isArray(matrixRaw)
        ? matrixRaw
        : ((matrixRaw as { data: MatrixSubject[] }).data ?? []);
      setHasMatrixSubjects(matrixRes.length > 0);

      if (matrixRes.length === 0) {
        setRows([]);
        return;
      }

      // Build a lookup of existing requirements by subject_id
      const existingBySubject = new Map<string, ApiCurriculumRow>();
      for (const req of currRes.data) {
        existingBySubject.set(req.subject_id, req);
      }

      // Merge: for each matrix subject, find or create an editable row
      const merged: EditableRow[] = matrixRes.map((ms) => {
        const existing = existingBySubject.get(ms.subject.id);
        if (existing) {
          return {
            subject_id: ms.subject.id,
            subject_name: ms.subject.name,
            classes: ms.classes,
            existing_id: existing.id,
            period_duration:
              existing.period_duration != null ? String(existing.period_duration) : '',
            min_periods_per_week: String(existing.min_periods_per_week),
            max_periods_per_day: String(existing.max_periods_per_day),
            requires_double_period: existing.requires_double_period,
            double_period_count:
              existing.double_period_count != null ? String(existing.double_period_count) : '',
          };
        }
        return {
          subject_id: ms.subject.id,
          subject_name: ms.subject.name,
          classes: ms.classes,
          existing_id: null,
          period_duration: '',
          min_periods_per_week: '1',
          max_periods_per_day: '1',
          requires_double_period: false,
          double_period_count: '',
        };
      });

      setRows(merged);
    } catch (err) {
      console.error('[SchedulingCurriculumPage]', err);
      setRows([]);
      setHasMatrixSubjects(true);
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, selectedYearGroup]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ─── Row update helpers ───────────────────────────────────────────────────

  const updateRow = React.useCallback((idx: number, patch: Partial<EditableRow>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }, []);

  // ─── Computed totals ─────────────────────────────────────────────────────

  const totalAllocated = rows.reduce((sum, r) => {
    const v = parseInt(r.min_periods_per_week, 10);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);
  const remaining = totalTeachingPeriods - totalAllocated;
  const overCapacity = remaining < 0;

  // ─── Save All ─────────────────────────────────────────────────────────────

  const handleSaveAll = async () => {
    if (!selectedYear || !selectedYearGroup) return;

    // Only save rows that have min_periods_per_week set (> 0)
    const itemsToSave = rows
      .filter((r) => {
        const min = parseInt(r.min_periods_per_week, 10);
        return !isNaN(min) && min >= 1;
      })
      .map((r) => ({
        academic_year_id: selectedYear,
        year_group_id: selectedYearGroup,
        subject_id: r.subject_id,
        min_periods_per_week: parseInt(r.min_periods_per_week, 10),
        max_periods_per_day: parseInt(r.max_periods_per_day, 10) || 1,
        requires_double_period: r.requires_double_period,
        double_period_count:
          r.requires_double_period && r.double_period_count
            ? parseInt(r.double_period_count, 10)
            : null,
        period_duration: r.period_duration ? parseInt(r.period_duration, 10) : null,
      }));

    if (itemsToSave.length === 0) return;

    setIsSaving(true);
    try {
      await apiClient('/api/v1/scheduling/curriculum-requirements/bulk-upsert', {
        method: 'POST',
        body: JSON.stringify({
          academic_year_id: selectedYear,
          year_group_id: selectedYearGroup,
          items: itemsToSave,
        }),
      });
      toast.success(tv('savedSuccessfully'));
      void fetchData();
    } catch (err) {
      console.error('[SchedulingCurriculumPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Copy from Year Group ────────────────────────────────────────────────

  const handleCopyFromYearGroup = async (sourceYgId: string) => {
    if (!selectedYear || !selectedYearGroup) return;
    try {
      // Fetch the source year group's requirements
      const params = new URLSearchParams({
        academic_year_id: selectedYear,
        year_group_id: sourceYgId,
        pageSize: '100',
      });
      const sourceRes = await apiClient<{ data: ApiCurriculumRow[] }>(
        `/api/v1/scheduling/curriculum-requirements?${params.toString()}`,
      );

      if (sourceRes.data.length === 0) {
        toast.error(tc('noResults'));
        return;
      }

      // Bulk-upsert into the target year group
      const items = sourceRes.data.map((r) => ({
        academic_year_id: selectedYear,
        year_group_id: selectedYearGroup,
        subject_id: r.subject_id,
        min_periods_per_week: r.min_periods_per_week,
        max_periods_per_day: r.max_periods_per_day,
        requires_double_period: r.requires_double_period,
        double_period_count: r.double_period_count,
        period_duration: r.period_duration,
      }));

      await apiClient('/api/v1/scheduling/curriculum-requirements/bulk-upsert', {
        method: 'POST',
        body: JSON.stringify({
          academic_year_id: selectedYear,
          year_group_id: selectedYearGroup,
          items,
        }),
      });

      toast.success(tv('copiedFromYearGroup'));
      void fetchData();
    } catch (err) {
      console.error('[SchedulingCurriculumPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={tv('curriculumRedesign')}
        description={tv('curriculumRedesignDesc')}
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
            <Select value={selectedYearGroup} onValueChange={setSelectedYearGroup}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder={tv('selectYearGroup')} />
              </SelectTrigger>
              <SelectContent>
                {yearGroups.map((yg) => (
                  <SelectItem key={yg.id} value={yg.id}>
                    {yg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {selectedYearGroup && (
        <>
          {/* Actions bar */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              onClick={() => void handleSaveAll()}
              disabled={isSaving || rows.length === 0}
            >
              <Save className="me-1.5 h-3.5 w-3.5" />
              {isSaving ? '...' : tv('saveAll')}
            </Button>

            <Select onValueChange={(v) => void handleCopyFromYearGroup(v)}>
              <SelectTrigger className="w-full sm:w-auto h-8 text-xs">
                <Copy className="me-1.5 h-3 w-3" />
                <SelectValue placeholder={tv('copyFromYearGroup')} />
              </SelectTrigger>
              <SelectContent>
                {yearGroups
                  .filter((yg) => yg.id !== selectedYearGroup)
                  .map((yg) => (
                    <SelectItem key={yg.id} value={yg.id}>
                      {yg.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <span
              className={`ms-auto text-sm font-medium ${overCapacity ? 'text-red-600 dark:text-red-400' : 'text-text-secondary'}`}
            >
              {tv('totalAllocated')}: {totalAllocated} / {totalTeachingPeriods}. {tv('remaining')}:{' '}
              {remaining}
            </span>
          </div>

          {overCapacity && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-700 px-4 py-3 flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <span className="text-sm text-red-800 dark:text-red-300">
                {tv('overCapacityWarning')}
              </span>
            </div>
          )}

          {/* Loading */}
          {isLoading && <div className="py-8 text-center text-text-tertiary">{tc('loading')}</div>}

          {/* Empty state: no subjects in matrix */}
          {!isLoading && !hasMatrixSubjects && (
            <div className="rounded-2xl border border-border bg-surface-secondary px-6 py-10 text-center space-y-3">
              <p className="text-sm text-text-secondary">{tv('noMatrixSubjects')}</p>
              <Button variant="outline" size="sm" asChild>
                <a href="/academics/curriculum-matrix">
                  <ExternalLink className="me-1.5 h-3.5 w-3.5" />
                  {tv('goToCurriculumMatrix')}
                </a>
              </Button>
            </div>
          )}

          {/* Inline-editable table */}
          {!isLoading && hasMatrixSubjects && rows.length > 0 && (
            <div className="rounded-2xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-secondary">
                      <th className="px-3 py-2.5 text-start text-xs font-medium text-text-tertiary uppercase">
                        {tv('subject')}
                      </th>
                      <th className="px-3 py-2.5 text-start text-xs font-medium text-text-tertiary uppercase">
                        {tv('classesCol')}
                      </th>
                      <th className="px-3 py-2.5 text-start text-xs font-medium text-text-tertiary uppercase whitespace-nowrap">
                        {tv('periodDurationCol')}
                      </th>
                      <th className="px-3 py-2.5 text-start text-xs font-medium text-text-tertiary uppercase whitespace-nowrap">
                        {tv('minPerWeekCol')}
                      </th>
                      <th className="px-3 py-2.5 text-start text-xs font-medium text-text-tertiary uppercase whitespace-nowrap">
                        {tv('maxPerDayCol')}
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-medium text-text-tertiary uppercase whitespace-nowrap">
                        {tv('doublePeriodCol')}
                      </th>
                      <th className="px-3 py-2.5 text-end text-xs font-medium text-text-tertiary uppercase whitespace-nowrap">
                        {tv('hoursPerWeek')}
                      </th>
                      <th className="px-3 py-2.5 text-end text-xs font-medium text-text-tertiary uppercase whitespace-nowrap">
                        {tv('hoursPerMonth')}
                      </th>
                      <th className="px-3 py-2.5 text-end text-xs font-medium text-text-tertiary uppercase whitespace-nowrap">
                        {tv('hoursPerYear')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, idx) => {
                      const hpw = computeHoursPerWeek(row);
                      const hpm = hpw != null ? hpw * 4 : null;
                      const hpy = hpw != null ? hpw * 33 : null;

                      return (
                        <tr
                          key={row.subject_id}
                          className="border-t border-border hover:bg-surface-secondary/50"
                        >
                          {/* Subject name (read-only) */}
                          <td className="px-3 py-2 font-medium text-text-primary whitespace-nowrap">
                            {row.subject_name}
                          </td>

                          {/* Classes (read-only badges) */}
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {row.classes.map((cls) => (
                                <Badge key={cls} variant="secondary" className="text-xs">
                                  {cls}
                                </Badge>
                              ))}
                            </div>
                          </td>

                          {/* Period Duration */}
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min={10}
                                max={180}
                                className="w-16 h-7 text-xs text-center"
                                value={row.period_duration}
                                placeholder="—"
                                onChange={(e) =>
                                  updateRow(idx, { period_duration: e.target.value })
                                }
                              />
                              <span className="text-xs text-text-tertiary">
                                {tv('minutesShort')}
                              </span>
                            </div>
                          </td>

                          {/* Min Periods/Week */}
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={1}
                              max={35}
                              className="w-16 h-7 text-xs text-center"
                              value={row.min_periods_per_week}
                              onChange={(e) =>
                                updateRow(idx, {
                                  min_periods_per_week: e.target.value,
                                })
                              }
                            />
                          </td>

                          {/* Max Periods/Day */}
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={1}
                              max={10}
                              className="w-16 h-7 text-xs text-center"
                              value={row.max_periods_per_day}
                              onChange={(e) =>
                                updateRow(idx, {
                                  max_periods_per_day: e.target.value,
                                })
                              }
                            />
                          </td>

                          {/* Double Period checkbox */}
                          <td className="px-3 py-2 text-center">
                            <Checkbox
                              checked={row.requires_double_period}
                              onCheckedChange={(checked) =>
                                updateRow(idx, {
                                  requires_double_period: checked === true,
                                  double_period_count:
                                    checked === true ? row.double_period_count || '1' : '',
                                })
                              }
                            />
                          </td>

                          {/* Hours/Week */}
                          <td className="px-3 py-2 text-end text-text-secondary tabular-nums whitespace-nowrap">
                            {hpw != null ? hpw.toFixed(1) : '—'}
                          </td>

                          {/* Hours/Month */}
                          <td className="px-3 py-2 text-end text-text-secondary tabular-nums whitespace-nowrap">
                            {hpm != null ? hpm.toFixed(1) : '—'}
                          </td>

                          {/* Hours/Year */}
                          <td className="px-3 py-2 text-end text-text-secondary tabular-nums whitespace-nowrap">
                            {hpy != null ? hpy.toFixed(1) : '—'}
                          </td>
                        </tr>
                      );
                    })}

                    {/* Totals row */}
                    <tr className="border-t-2 border-border bg-surface-secondary font-medium">
                      <td className="px-3 py-2.5 text-text-primary" colSpan={2}>
                        {tv('forecastTeachingHours')}
                      </td>
                      <td className="px-3 py-2.5" />
                      <td className="px-3 py-2.5 text-center text-text-primary tabular-nums">
                        {totalAllocated}
                      </td>
                      <td className="px-3 py-2.5" />
                      <td className="px-3 py-2.5" />
                      <td className="px-3 py-2.5 text-end text-text-primary tabular-nums">
                        {rows.reduce((sum, r) => sum + (computeHoursPerWeek(r) ?? 0), 0).toFixed(1)}
                      </td>
                      <td className="px-3 py-2.5 text-end text-text-primary tabular-nums">
                        {(
                          rows.reduce((sum, r) => sum + (computeHoursPerWeek(r) ?? 0), 0) * 4
                        ).toFixed(1)}
                      </td>
                      <td className="px-3 py-2.5 text-end text-text-primary tabular-nums">
                        {(
                          rows.reduce((sum, r) => sum + (computeHoursPerWeek(r) ?? 0), 0) * 33
                        ).toFixed(1)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Has subjects but table is empty after loading (shouldn't normally happen) */}
          {!isLoading && hasMatrixSubjects && rows.length === 0 && (
            <div className="py-8 text-center text-text-tertiary">{tv('noRequirements')}</div>
          )}
        </>
      )}
    </div>
  );
}
