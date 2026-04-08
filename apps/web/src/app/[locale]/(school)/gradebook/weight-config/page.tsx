'use client';

import { ArrowLeft, Save, ToggleLeft, ToggleRight } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
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

interface SelectOption {
  id: string;
  name: string;
}

interface ClassItem {
  id: string;
  name: string;
  year_group?: { id: string; name: string } | null;
}

interface GradeConfig {
  class_id: string;
  subject_id: string;
}

interface WeightRecord {
  id: string;
  subject_id?: string;
  academic_period_id?: string;
  year_group_id?: string | null;
  class_id?: string | null;
  weight: number | string | { s: number; e: number; d: number[] };
  subject?: { id: string; name: string } | null;
  academic_period?: { id: string; name: string } | null;
  year_group?: { id: string; name: string } | null;
  class_entity?: { id: string; name: string } | null;
}

interface YearGroupEntry {
  id: string;
  name: string;
  classes: ClassItem[];
}

type ScopeMode = 'year_group' | 'class';
type ActiveTab = 'subject' | 'period';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseWeight(
  val: number | string | { s: number; e: number; d: number[] } | null | undefined,
): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return parseFloat(val) || 0;
  if (typeof val === 'object' && 'd' in val && 'e' in val && 's' in val) {
    const firstDigit = val.d[0] ?? 0;
    const digitLen = String(firstDigit).length;
    return val.s * firstDigit * Math.pow(10, val.e - digitLen + 1);
  }
  return 0;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WeightConfigPage() {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const locale = (pathname ?? '').split('/').filter(Boolean)[0] ?? 'en';

  // ─── Data state ─────────────────────────────────────────────────────────
  const [academicYears, setAcademicYears] = React.useState<SelectOption[]>([]);
  const [academicPeriods, setAcademicPeriods] = React.useState<SelectOption[]>([]);
  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroupEntry[]>([]);
  const [curriculumMap, setCurriculumMap] = React.useState<Set<string>>(new Set());

  // ─── Filter state ───────────────────────────────────────────────────────
  const [activeYearId, setActiveYearId] = React.useState('');
  const [selectedPeriodId, setSelectedPeriodId] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<ActiveTab>('subject');

  // ─── Subject weights state ──────────────────────────────────────────────
  const [subjectScopeMode, setSubjectScopeMode] = React.useState<ScopeMode>('year_group');
  // Key: `${rowId}:${subjectId}` → weight value
  const [subjectWeights, setSubjectWeights] = React.useState<Map<string, number>>(new Map());
  const [subjectSaving, setSubjectSaving] = React.useState(false);

  // ─── Period weights state ───────────────────────────────────────────────
  const [periodScopeMode, setPeriodScopeMode] = React.useState<ScopeMode>('year_group');
  // Key: `${rowId}:${periodId}` → weight value
  const [periodWeights, setPeriodWeights] = React.useState<Map<string, number>>(new Map());
  const [periodSaving, setPeriodSaving] = React.useState(false);

  const [isLoading, setIsLoading] = React.useState(true);

  // ─── Fetch reference data ───────────────────────────────────────────────
  React.useEffect(() => {
    async function fetchData() {
      try {
        const [yearsRes, periodsRes, subjectsRes, classesRes] = await Promise.all([
          apiClient<{ data: SelectOption[] }>('/api/v1/academic-years?pageSize=50'),
          apiClient<{ data: SelectOption[] }>('/api/v1/academic-periods?pageSize=50'),
          apiClient<{ data: SelectOption[] }>(
            '/api/v1/subjects?pageSize=100&subject_type=academic',
          ),
          apiClient<{ data: ClassItem[] }>('/api/v1/classes?pageSize=100&status=active'),
        ]);

        setAcademicYears(yearsRes.data);
        setAcademicPeriods(periodsRes.data);
        setSubjects(subjectsRes.data.sort((a, b) => a.name.localeCompare(b.name)));

        // Group classes by year group
        const ygMap = new Map<string, YearGroupEntry>();
        for (const cls of classesRes.data) {
          const yg = cls.year_group;
          if (!yg) continue;
          if (!ygMap.has(yg.id)) {
            ygMap.set(yg.id, { id: yg.id, name: yg.name, classes: [] });
          }
          ygMap.get(yg.id)!.classes.push(cls);
        }
        // Sort year groups by name, classes within each group by name
        const sorted = Array.from(ygMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        for (const yg of sorted) {
          yg.classes.sort((a, b) => a.name.localeCompare(b.name));
        }
        setYearGroups(sorted);

        // Default to first academic year
        const firstYear = yearsRes.data[0];
        if (firstYear) {
          setActiveYearId(firstYear.id);
        }
        const firstPeriod = periodsRes.data[0];
        if (firstPeriod) {
          setSelectedPeriodId(firstPeriod.id);
        }

        // Fetch curriculum matrix (class-subject mappings)
        const configSet = new Set<string>();
        for (const cls of classesRes.data) {
          try {
            const configs = await apiClient<{ data: GradeConfig[] }>(
              `/api/v1/gradebook/classes/${cls.id}/grade-configs`,
              { silent: true },
            );
            for (const cfg of configs.data) {
              configSet.add(`${cfg.class_id}:${cfg.subject_id}`);
            }
          } catch (err) {
            console.error('[WeightConfigPage] fetchGradeConfigs', err);
          }
        }
        setCurriculumMap(configSet);
      } catch (err) {
        console.error('[WeightConfigPage] fetchData', err);
      } finally {
        setIsLoading(false);
      }
    }

    void fetchData();
  }, []);

  // ─── Fetch existing weights when year/period changes ────────────────────
  React.useEffect(() => {
    if (!activeYearId) return;

    async function fetchWeights() {
      try {
        // Fetch subject weights for selected period
        if (selectedPeriodId) {
          const res = await apiClient<{ data: WeightRecord[] }>(
            `/api/v1/gradebook/weight-config/subject-weights?academic_year_id=${activeYearId}&academic_period_id=${selectedPeriodId}`,
          );
          const map = new Map<string, number>();
          for (const w of res.data) {
            const rowId = w.class_id ?? w.year_group_id ?? '';
            const key = `${rowId}:${w.subject_id}`;
            map.set(key, parseWeight(w.weight));
          }
          setSubjectWeights(map);

          // Detect scope mode from existing data
          if (res.data.length > 0) {
            const hasClassLevel = res.data.some((w) => w.class_id != null);
            setSubjectScopeMode(hasClassLevel ? 'class' : 'year_group');
          }
        }

        // Fetch period weights
        const pRes = await apiClient<{ data: WeightRecord[] }>(
          `/api/v1/gradebook/weight-config/period-weights?academic_year_id=${activeYearId}`,
        );
        const pMap = new Map<string, number>();
        for (const w of pRes.data) {
          const rowId = w.class_id ?? w.year_group_id ?? '';
          const key = `${rowId}:${w.academic_period_id}`;
          pMap.set(key, parseWeight(w.weight));
        }
        setPeriodWeights(pMap);

        if (pRes.data.length > 0) {
          const hasClassLevel = pRes.data.some((w) => w.class_id != null);
          setPeriodScopeMode(hasClassLevel ? 'class' : 'year_group');
        }
      } catch (err) {
        console.error('[WeightConfigPage] fetchWeights', err);
      }
    }

    void fetchWeights();
  }, [activeYearId, selectedPeriodId]);

  // ─── Helper: get rows based on scope mode ───────────────────────────────
  const getRows = (
    scopeMode: ScopeMode,
  ): Array<{ id: string; name: string; yearGroupName: string; isYearGroup: boolean }> => {
    const rows: Array<{ id: string; name: string; yearGroupName: string; isYearGroup: boolean }> =
      [];
    for (const yg of yearGroups) {
      if (scopeMode === 'year_group') {
        rows.push({ id: yg.id, name: yg.name, yearGroupName: yg.name, isYearGroup: true });
      } else {
        for (const cls of yg.classes) {
          rows.push({ id: cls.id, name: cls.name, yearGroupName: yg.name, isYearGroup: false });
        }
      }
    }
    return rows;
  };

  // ─── Helper: check if subject is in curriculum for a row ────────────────
  const isSubjectAvailable = (rowId: string, subjectId: string, scopeMode: ScopeMode): boolean => {
    if (scopeMode === 'year_group') {
      // Available if ANY class in the year group has this subject
      const yg = yearGroups.find((y) => y.id === rowId);
      if (!yg) return false;
      return yg.classes.some((cls) => curriculumMap.has(`${cls.id}:${subjectId}`));
    }
    return curriculumMap.has(`${rowId}:${subjectId}`);
  };

  // ─── Helper: compute row total ──────────────────────────────────────────
  const getRowTotal = (
    rowId: string,
    weights: Map<string, number>,
    columnIds: string[],
  ): number => {
    return columnIds.reduce((sum, colId) => sum + (weights.get(`${rowId}:${colId}`) ?? 0), 0);
  };

  // ─── Update a single weight cell ───────────────────────────────────────
  const updateWeight = (
    rowId: string,
    colId: string,
    value: string,
    setter: React.Dispatch<React.SetStateAction<Map<string, number>>>,
  ) => {
    const num = value === '' ? 0 : parseFloat(value);
    if (isNaN(num) || num < 0 || num > 100) return;
    setter((prev) => {
      const next = new Map(prev);
      next.set(`${rowId}:${colId}`, num);
      return next;
    });
  };

  // ─── Save subject weights ──────────────────────────────────────────────
  const handleSaveSubjectWeights = async () => {
    if (!activeYearId || !selectedPeriodId) return;
    setSubjectSaving(true);

    const rows = getRows(subjectScopeMode);
    const errors: string[] = [];

    try {
      for (const row of rows) {
        const weights: Array<{ subject_id: string; weight: number }> = [];
        for (const subj of subjects) {
          const available = isSubjectAvailable(row.id, subj.id, subjectScopeMode);
          if (!available) continue;
          const w = subjectWeights.get(`${row.id}:${subj.id}`) ?? 0;
          if (w > 0) weights.push({ subject_id: subj.id, weight: w });
        }

        if (weights.length === 0) continue;

        const total = weights.reduce((s, w) => s + w.weight, 0);
        if (Math.abs(total - 100) > 0.01) {
          errors.push(`${row.name}: ${total}%`);
          continue;
        }

        await apiClient('/api/v1/gradebook/weight-config/subject-weights', {
          method: 'PUT',
          body: JSON.stringify({
            academic_year_id: activeYearId,
            academic_period_id: selectedPeriodId,
            scope_type: subjectScopeMode,
            scope_id: row.id,
            weights,
          }),
        });
      }

      if (errors.length > 0) {
        toast.error(`Rows not summing to 100%: ${errors.join(', ')}`);
      } else {
        toast.success(tc('saved'));
      }
    } catch (err) {
      console.error('[WeightConfigPage] saveSubjectWeights', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setSubjectSaving(false);
    }
  };

  // ─── Save period weights ───────────────────────────────────────────────
  const handleSavePeriodWeights = async () => {
    if (!activeYearId) return;
    setPeriodSaving(true);

    const rows = getRows(periodScopeMode);
    const errors: string[] = [];

    try {
      for (const row of rows) {
        const weights: Array<{ academic_period_id: string; weight: number }> = [];
        for (const period of academicPeriods) {
          const w = periodWeights.get(`${row.id}:${period.id}`) ?? 0;
          if (w > 0) weights.push({ academic_period_id: period.id, weight: w });
        }

        if (weights.length === 0) continue;

        const total = weights.reduce((s, w) => s + w.weight, 0);
        if (Math.abs(total - 100) > 0.01) {
          errors.push(`${row.name}: ${total}%`);
          continue;
        }

        await apiClient('/api/v1/gradebook/weight-config/period-weights', {
          method: 'PUT',
          body: JSON.stringify({
            academic_year_id: activeYearId,
            scope_type: periodScopeMode,
            scope_id: row.id,
            weights,
          }),
        });
      }

      if (errors.length > 0) {
        toast.error(`Rows not summing to 100%: ${errors.join(', ')}`);
      } else {
        toast.success(tc('saved'));
      }
    } catch (err) {
      console.error('[WeightConfigPage] savePeriodWeights', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setPeriodSaving(false);
    }
  };

  // ─── Toggle scope mode with propagation ─────────────────────────────────
  const handleToggleSubjectScope = async () => {
    if (subjectScopeMode === 'year_group') {
      // Switching to per-class: propagate year-group weights to classes
      if (activeYearId && selectedPeriodId) {
        for (const yg of yearGroups) {
          try {
            await apiClient('/api/v1/gradebook/weight-config/subject-weights/propagate', {
              method: 'POST',
              body: JSON.stringify({
                academic_year_id: activeYearId,
                academic_period_id: selectedPeriodId,
                year_group_id: yg.id,
              }),
            });
          } catch (err) {
            console.error('[WeightConfigPage] propagateSubjectWeights', err);
          }
        }
      }
      setSubjectScopeMode('class');
    } else {
      setSubjectScopeMode('year_group');
    }
  };

  const handleTogglePeriodScope = async () => {
    if (periodScopeMode === 'year_group') {
      if (activeYearId) {
        for (const yg of yearGroups) {
          try {
            await apiClient('/api/v1/gradebook/weight-config/period-weights/propagate', {
              method: 'POST',
              body: JSON.stringify({
                academic_year_id: activeYearId,
                year_group_id: yg.id,
              }),
            });
          } catch (err) {
            console.error('[WeightConfigPage] propagatePeriodWeights', err);
          }
        }
      }
      setPeriodScopeMode('class');
    } else {
      setPeriodScopeMode('year_group');
    }
  };

  // ─── Derived data (must be above any early return for hook safety) ────

  type RowEntry = { id: string; name: string; yearGroupName: string; isYearGroup: boolean };
  type RowGroup = { yearGroupName: string; rows: RowEntry[] };

  const subjectRows = React.useMemo(
    () => getRows(subjectScopeMode),
    [yearGroups, subjectScopeMode],
  );
  const periodRows = React.useMemo(() => getRows(periodScopeMode), [yearGroups, periodScopeMode]);

  const groupedSubjectRows = React.useMemo(() => {
    const groups: RowGroup[] = [];
    let currentGroup = '';
    for (const row of subjectRows) {
      if (row.yearGroupName !== currentGroup) {
        groups.push({ yearGroupName: row.yearGroupName, rows: [] });
        currentGroup = row.yearGroupName;
      }
      const lastGroup = groups[groups.length - 1];
      if (lastGroup) lastGroup.rows.push(row);
    }
    return groups;
  }, [subjectRows]);

  const groupedPeriodRows = React.useMemo(() => {
    const groups: RowGroup[] = [];
    let currentGroup = '';
    for (const row of periodRows) {
      if (row.yearGroupName !== currentGroup) {
        groups.push({ yearGroupName: row.yearGroupName, rows: [] });
        currentGroup = row.yearGroupName;
      }
      const lastGroup = groups[groups.length - 1];
      if (lastGroup) lastGroup.rows.push(row);
    }
    return groups;
  }, [periodRows]);

  // ─── Render ─────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 animate-pulse rounded bg-surface-secondary" />
        <div className="h-96 animate-pulse rounded-xl bg-surface-secondary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/${locale}/gradebook`)}>
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
        </Button>
        <PageHeader title={t('weightConfigTitle')} />
      </div>

      {/* Academic year selector */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={activeYearId} onValueChange={setActiveYearId}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('academicYear')} />
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

      {/* Tabs */}
      <nav className="flex gap-1 border-b border-border" aria-label="Weight config tabs">
        {(['subject', 'period'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors rounded-t-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 ${
              activeTab === tab
                ? 'text-primary-700 bg-surface-secondary border-b-2 border-primary-700'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-secondary'
            }`}
          >
            {tab === 'subject' ? t('weightConfigSubjectTab') : t('weightConfigPeriodTab')}
          </button>
        ))}
      </nav>

      {/* ─── Subject Weights Tab ─────────────────────────────────────────── */}
      {activeTab === 'subject' && (
        <div className="space-y-4">
          {/* Controls bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue placeholder={t('period')} />
                </SelectTrigger>
                <SelectContent>
                  {academicPeriods.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <button
                onClick={() => void handleToggleSubjectScope()}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-secondary transition-colors"
              >
                {subjectScopeMode === 'year_group' ? (
                  <ToggleLeft className="h-4 w-4 text-text-tertiary" />
                ) : (
                  <ToggleRight className="h-4 w-4 text-primary-600" />
                )}
                {subjectScopeMode === 'year_group'
                  ? t('weightConfigScopeYearGroup')
                  : t('weightConfigScopeClass')}
              </button>
            </div>

            <Button onClick={() => void handleSaveSubjectWeights()} disabled={subjectSaving}>
              <Save className="me-2 h-4 w-4" />
              {subjectSaving ? tc('loading') : tc('save')}
            </Button>
          </div>

          {/* Matrix table */}
          <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th
                      className="sticky start-0 z-20 bg-primary-900 text-white text-xs font-semibold px-3 py-2.5 text-start"
                      style={{ minWidth: 140 }}
                    >
                      {subjectScopeMode === 'year_group' ? t('yearGroup') : t('class')}
                    </th>
                    {subjects.map((s) => (
                      <th
                        key={s.id}
                        className="bg-primary-700 text-white text-[10px] font-semibold px-1.5 py-2.5 text-center"
                        style={{ minWidth: 70 }}
                      >
                        {s.name}
                      </th>
                    ))}
                    <th
                      className="bg-primary-900 text-white text-xs font-semibold px-3 py-2.5 text-center"
                      style={{ minWidth: 70 }}
                    >
                      {t('weightConfigTotal')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupedSubjectRows.map((group) => (
                    <React.Fragment key={group.yearGroupName}>
                      {subjectScopeMode === 'class' && (
                        <tr>
                          <td
                            colSpan={subjects.length + 2}
                            className="bg-surface-secondary px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-primary border-b border-border"
                          >
                            {group.yearGroupName}
                          </td>
                        </tr>
                      )}
                      {group.rows.map((row, ri) => {
                        const total = getRowTotal(
                          row.id,
                          subjectWeights,
                          subjects.map((s) => s.id),
                        );
                        const isValid = Math.abs(total - 100) <= 0.01 || total === 0;
                        return (
                          <tr
                            key={row.id}
                            className={`${ri % 2 === 1 ? 'bg-surface-secondary/50' : ''} border-b border-border last:border-b-0`}
                          >
                            <td className="sticky start-0 z-10 bg-inherit px-3 py-1.5 text-sm font-medium text-text-primary border-e border-border whitespace-nowrap">
                              {row.name}
                            </td>
                            {subjects.map((s) => {
                              const available = isSubjectAvailable(row.id, s.id, subjectScopeMode);
                              const key = `${row.id}:${s.id}`;
                              const val = subjectWeights.get(key) ?? 0;
                              return (
                                <td
                                  key={s.id}
                                  className="px-0.5 py-1 text-center border-e border-border/50"
                                  style={{ minWidth: 70 }}
                                >
                                  {available ? (
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step={0.5}
                                      value={val || ''}
                                      onChange={(e) =>
                                        updateWeight(
                                          row.id,
                                          s.id,
                                          e.target.value,
                                          setSubjectWeights,
                                        )
                                      }
                                      placeholder="—"
                                      dir="ltr"
                                      className="w-[58px] rounded border border-border bg-surface px-1 py-1 text-center text-xs font-medium tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                    />
                                  ) : (
                                    <span className="inline-block w-[58px] rounded bg-surface-secondary px-1 py-1 text-center text-xs text-text-tertiary">
                                      —
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                            <td
                              className={`px-2 py-1.5 text-center text-xs font-bold tabular-nums ${isValid ? 'text-text-primary' : 'text-danger-text'}`}
                            >
                              {total > 0 ? `${total}%` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── Period Weights Tab ───────────────────────────────────────────── */}
      {activeTab === 'period' && (
        <div className="space-y-4">
          {/* Controls bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => void handleTogglePeriodScope()}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-secondary hover:bg-surface-secondary transition-colors"
            >
              {periodScopeMode === 'year_group' ? (
                <ToggleLeft className="h-4 w-4 text-text-tertiary" />
              ) : (
                <ToggleRight className="h-4 w-4 text-primary-600" />
              )}
              {periodScopeMode === 'year_group'
                ? t('weightConfigScopeYearGroup')
                : t('weightConfigScopeClass')}
            </button>

            <Button onClick={() => void handleSavePeriodWeights()} disabled={periodSaving}>
              <Save className="me-2 h-4 w-4" />
              {periodSaving ? tc('loading') : tc('save')}
            </Button>
          </div>

          {/* Matrix table */}
          <div className="rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th
                      className="sticky start-0 z-20 bg-primary-900 text-white text-xs font-semibold px-3 py-2.5 text-start"
                      style={{ minWidth: 140 }}
                    >
                      {periodScopeMode === 'year_group' ? t('yearGroup') : t('class')}
                    </th>
                    {academicPeriods.map((p) => (
                      <th
                        key={p.id}
                        className="bg-primary-700 text-white text-xs font-semibold px-3 py-2.5 text-center"
                        style={{ minWidth: 100 }}
                      >
                        {p.name}
                      </th>
                    ))}
                    <th
                      className="bg-primary-900 text-white text-xs font-semibold px-3 py-2.5 text-center"
                      style={{ minWidth: 70 }}
                    >
                      {t('weightConfigTotal')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groupedPeriodRows.map((group) => (
                    <React.Fragment key={group.yearGroupName}>
                      {periodScopeMode === 'class' && (
                        <tr>
                          <td
                            colSpan={academicPeriods.length + 2}
                            className="bg-surface-secondary px-3 py-2 text-xs font-bold uppercase tracking-wider text-text-primary border-b border-border"
                          >
                            {group.yearGroupName}
                          </td>
                        </tr>
                      )}
                      {group.rows.map((row, ri) => {
                        const total = getRowTotal(
                          row.id,
                          periodWeights,
                          academicPeriods.map((p) => p.id),
                        );
                        const isValid = Math.abs(total - 100) <= 0.01 || total === 0;
                        return (
                          <tr
                            key={row.id}
                            className={`${ri % 2 === 1 ? 'bg-surface-secondary/50' : ''} border-b border-border last:border-b-0`}
                          >
                            <td className="sticky start-0 z-10 bg-inherit px-3 py-1.5 text-sm font-medium text-text-primary border-e border-border whitespace-nowrap">
                              {row.name}
                            </td>
                            {academicPeriods.map((p) => {
                              const key = `${row.id}:${p.id}`;
                              const val = periodWeights.get(key) ?? 0;
                              return (
                                <td
                                  key={p.id}
                                  className="px-1 py-1 text-center border-e border-border/50"
                                >
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step={0.5}
                                    value={val || ''}
                                    onChange={(e) =>
                                      updateWeight(row.id, p.id, e.target.value, setPeriodWeights)
                                    }
                                    placeholder="—"
                                    dir="ltr"
                                    className="w-[70px] rounded border border-border bg-surface px-1.5 py-1 text-center text-xs font-medium tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                                  />
                                </td>
                              );
                            })}
                            <td
                              className={`px-2 py-1.5 text-center text-xs font-bold tabular-nums ${isValid ? 'text-text-primary' : 'text-danger-text'}`}
                            >
                              {total > 0 ? `${total}%` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
