'use client';

import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';
import { AlertTriangle, Copy, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


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

interface BreakGroup {
  id: string;
  name: string;
}

type PeriodType = 'teaching' | 'break_supervision' | 'lunch_duty' | 'assembly' | 'free';
type SupervisionMode = 'none' | 'yard' | 'classroom_previous' | 'classroom_next';

interface PeriodSlot {
  id: string;
  academic_year_id: string;
  year_group_id: string | null;
  weekday: number;
  period_order: number;
  period_name: string;
  period_name_ar: string | null;
  start_time: string;
  end_time: string;
  schedule_period_type: PeriodType;
  supervision_mode: SupervisionMode;
  break_group_id: string | null;
}

interface EditState {
  id: string | null;
  weekday: number;
  name: string;
  name_ar: string;
  start_time: string;
  end_time: string;
  period_type: PeriodType;
  supervision_mode: SupervisionMode;
  break_group_id: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAY_LABELS: Record<number, string> = {
  0: 'sunday',
  1: 'monday',
  2: 'tuesday',
  3: 'wednesday',
  4: 'thursday',
  5: 'friday',
  6: 'saturday',
};

const TYPE_STYLES: Record<PeriodType, string> = {
  teaching: 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-300',
  break_supervision: 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300',
  lunch_duty: 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-300',
  assembly: 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950 dark:border-purple-800 dark:text-purple-300',
  free: 'bg-surface-secondary border-border text-text-tertiary',
};

const EMPTY_EDIT: EditState = {
  id: null,
  weekday: 1,
  name: '',
  name_ar: '',
  start_time: '08:00',
  end_time: '09:00',
  period_type: 'teaching',
  supervision_mode: 'none',
  break_group_id: '',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PeriodGridPage() {
  const t = useTranslations('scheduling');
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [breakGroups, setBreakGroups] = React.useState<BreakGroup[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [selectedYearGroup, setSelectedYearGroup] = React.useState('');
  const [periods, setPeriods] = React.useState<PeriodSlot[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const [editOpen, setEditOpen] = React.useState(false);
  const [editState, setEditState] = React.useState<EditState>(EMPTY_EDIT);
  const [isSaving, setIsSaving] = React.useState(false);

  const [copyYgOpen, setCopyYgOpen] = React.useState(false);
  const [copySourceYg, setCopySourceYg] = React.useState('');

  // Load reference data on mount
  React.useEffect(() => {
    Promise.all([
      apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20'),
      apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100'),
      apiClient<{ data: BreakGroup[] }>('/api/v1/scheduling/break-groups?pageSize=100').catch(() => ({ data: [] as BreakGroup[] })),
    ]).then(([yearsRes, ygRes, bgRes]) => {
      setAcademicYears(yearsRes.data);
      setYearGroups(ygRes.data);
      setBreakGroups(bgRes.data);
      if (yearsRes.data.length > 0 && yearsRes.data[0]) {
        setSelectedYear(yearsRes.data[0].id);
      }
      if (ygRes.data.length > 0 && ygRes.data[0]) {
        setSelectedYearGroup(ygRes.data[0].id);
      }
    }).catch(() => toast.error(tc('errorGeneric')));
  }, [tc]);

  // Load period grid when year or year group changes
  const fetchGrid = React.useCallback(async () => {
    if (!selectedYear || !selectedYearGroup) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        academic_year_id: selectedYear,
        year_group_id: selectedYearGroup,
      });
      const res = await apiClient<PeriodSlot[] | { data: PeriodSlot[] }>(`/api/v1/period-grid?${params.toString()}`);
      setPeriods(Array.isArray(res) ? res : (res.data ?? []));
    } catch {
      setPeriods([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, selectedYearGroup]);

  React.useEffect(() => {
    void fetchGrid();
  }, [fetchGrid]);

  const periodsForDay = (weekday: number) =>
    periods
      .filter((p) => p.weekday === weekday)
      .sort((a, b) => a.period_order - b.period_order);

  const teachingCount = periods.filter((p) => p.schedule_period_type === 'teaching').length;
  const breakCount = periods.filter((p) => p.schedule_period_type === 'break_supervision' || p.schedule_period_type === 'lunch_duty').length;

  const openAdd = (weekday: number) => {
    setEditState({ ...EMPTY_EDIT, weekday });
    setEditOpen(true);
  };

  const openEdit = (period: PeriodSlot) => {
    setEditState({
      id: period.id,
      weekday: period.weekday,
      name: period.period_name,
      name_ar: period.period_name_ar ?? '',
      start_time: period.start_time,
      end_time: period.end_time,
      period_type: period.schedule_period_type,
      supervision_mode: period.supervision_mode,
      break_group_id: period.break_group_id ?? '',
    });
    setEditOpen(true);
  };

  const isBreakType = editState.period_type === 'break_supervision' || editState.period_type === 'lunch_duty';

  const handleSave = async () => {
    if (!editState.name.trim() || !selectedYear || !selectedYearGroup) return;
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        period_name: editState.name,
        period_name_ar: editState.name_ar || null,
        start_time: editState.start_time,
        end_time: editState.end_time,
        schedule_period_type: editState.period_type,
        supervision_mode: isBreakType ? editState.supervision_mode : 'none',
        break_group_id: editState.supervision_mode === 'yard' ? editState.break_group_id || null : null,
      };

      if (editState.id) {
        await apiClient(`/api/v1/period-grid/${editState.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        const dayPeriods = periodsForDay(editState.weekday);
        await apiClient('/api/v1/period-grid', {
          method: 'POST',
          body: JSON.stringify({
            ...body,
            academic_year_id: selectedYear,
            year_group_id: selectedYearGroup,
            weekday: editState.weekday,
            period_order: dayPeriods.length + 1,
          }),
        });
      }
      setEditOpen(false);
      toast.success(editState.id ? tv('periodUpdated') : tv('periodAdded'));
      void fetchGrid();
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/v1/period-grid/${id}`, { method: 'DELETE' });
      setPeriods((prev) => prev.filter((p) => p.id !== id));
      toast.success(tc('delete'));
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const handleCopyMondayToAll = async () => {
    try {
      await apiClient('/api/v1/period-grid/copy-day', {
        method: 'POST',
        body: JSON.stringify({
          academic_year_id: selectedYear,
          year_group_id: selectedYearGroup,
          from_weekday: 1,
          to_weekdays: [2, 3, 4, 5],
        }),
      });
      toast.success(tv('copiedMondayToAll'));
      void fetchGrid();
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const handleCopyFromYearGroup = async () => {
    if (!copySourceYg) return;
    try {
      await apiClient('/api/v1/period-grid/copy-year-group', {
        method: 'POST',
        body: JSON.stringify({
          academic_year_id: selectedYear,
          source_year_group_id: copySourceYg,
          target_year_group_id: selectedYearGroup,
        }),
      });
      setCopyYgOpen(false);
      toast.success(tv('copiedFromYearGroup'));
      void fetchGrid();
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const supervisionLabel = (mode: SupervisionMode): string => {
    switch (mode) {
      case 'yard': return tv('supervisionYard');
      case 'classroom_previous': return tv('supervisionClassPrev');
      case 'classroom_next': return tv('supervisionClassNext');
      default: return '';
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('auto.periodGrid')}
        description={tv('periodGridDescV2')}
        actions={
          <div className="flex items-center gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder={tv('selectAcademicYear')} />
              </SelectTrigger>
              <SelectContent>
                {academicYears.map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedYearGroup} onValueChange={setSelectedYearGroup}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder={tv('selectYearGroup')} />
              </SelectTrigger>
              <SelectContent>
                {yearGroups.map((yg) => (
                  <SelectItem key={yg.id} value={yg.id}>{yg.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      {!selectedYearGroup && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-800 dark:text-amber-300">{tv('selectYearGroupFirst')}</span>
        </div>
      )}

      {selectedYearGroup && (
        <>
          {/* Quick actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyMondayToAll}>
              <Copy className="me-1.5 h-3.5 w-3.5" />
              {tv('copyMondayToAll')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCopyYgOpen(true)}>
              <Copy className="me-1.5 h-3.5 w-3.5" />
              {tv('copyFromYearGroup')}
            </Button>
            <span className="ms-auto text-xs text-text-tertiary">
              {teachingCount} {t('auto.teachingPeriods')} &middot; {breakCount} {tv('breaks')}
            </span>
          </div>

          {/* Period Grid */}
          {isLoading ? (
            <div className="grid grid-cols-7 gap-3">
              {WEEKDAYS.map((d) => (
                <div key={d} className="h-64 animate-pulse rounded-lg bg-surface-secondary" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="grid min-w-[900px] grid-cols-7 gap-3">
                {WEEKDAYS.map((weekday) => {
                  const dayPeriods = periodsForDay(weekday);
                  return (
                    <div key={weekday} className="flex flex-col gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                        {t(WEEKDAY_LABELS[weekday]!)}
                      </span>
                      {dayPeriods.map((period) => (
                        <div
                          key={period.id}
                          className={`group relative cursor-pointer rounded-md border p-2 text-xs transition-all hover:shadow-sm ${TYPE_STYLES[period.schedule_period_type]}`}
                          onClick={() => openEdit(period)}
                        >
                          <div className="font-medium">{period.period_name}</div>
                          <div className="mt-0.5 font-mono text-[10px] opacity-70">
                            {period.start_time} - {period.end_time}
                          </div>
                          <Badge variant="secondary" className="mt-1 text-[10px] capitalize">
                            {period.schedule_period_type.replace('_', ' ')}
                          </Badge>
                          {period.supervision_mode !== 'none' && (
                            <div className="mt-0.5 text-[10px] opacity-80">
                              {supervisionLabel(period.supervision_mode)}
                            </div>
                          )}
                          <button
                            className="absolute end-1 top-1 hidden rounded p-0.5 hover:bg-red-100 group-hover:flex"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDelete(period.id);
                            }}
                            aria-label={tc('delete')}
                          >
                            <Trash2 className="h-3 w-3 text-red-500" />
                          </button>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full border border-dashed border-border text-xs text-text-tertiary hover:border-primary hover:text-primary"
                        onClick={() => openAdd(weekday)}
                      >
                        <Plus className="me-1 h-3 w-3" />
                        {t('auto.addPeriod')}
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Edit / Add Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editState.id ? tc('edit') : t('auto.addPeriod')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('auto.periodName')}</Label>
                <Input
                  value={editState.name}
                  onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                  placeholder="e.g. Period 1"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('auto.periodNameAr')}</Label>
                <Input
                  value={editState.name_ar}
                  onChange={(e) => setEditState((s) => ({ ...s, name_ar: e.target.value }))}
                  dir="rtl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('startTime')}</Label>
                <Input
                  type="time"
                  value={editState.start_time}
                  onChange={(e) => setEditState((s) => ({ ...s, start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('endTime')}</Label>
                <Input
                  type="time"
                  value={editState.end_time}
                  onChange={(e) => setEditState((s) => ({ ...s, end_time: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('auto.periodType')}</Label>
              <Select
                value={editState.period_type}
                onValueChange={(v) =>
                  setEditState((s) => ({ ...s, period_type: v as PeriodType }))
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="teaching">{t('auto.teaching')}</SelectItem>
                  <SelectItem value="break_supervision">{t('auto.breakSupervision')}</SelectItem>
                  <SelectItem value="lunch_duty">{t('auto.lunchDuty')}</SelectItem>
                  <SelectItem value="assembly">{t('auto.assembly')}</SelectItem>
                  <SelectItem value="free">{t('auto.free')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {isBreakType && (
              <>
                <div className="space-y-1.5">
                  <Label>{tv('supervisionMode')}</Label>
                  <Select
                    value={editState.supervision_mode}
                    onValueChange={(v) =>
                      setEditState((s) => ({ ...s, supervision_mode: v as SupervisionMode }))
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yard">{tv('supervisionYard')}</SelectItem>
                      <SelectItem value="classroom_previous">{tv('supervisionClassPrev')}</SelectItem>
                      <SelectItem value="classroom_next">{tv('supervisionClassNext')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editState.supervision_mode === 'yard' && (
                  <div className="space-y-1.5">
                    <Label>{tv('breakGroup')}</Label>
                    <Select
                      value={editState.break_group_id}
                      onValueChange={(v) => setEditState((s) => ({ ...s, break_group_id: v }))}
                    >
                      <SelectTrigger><SelectValue placeholder={tv('selectBreakGroup')} /></SelectTrigger>
                      <SelectContent>
                        {breakGroups.map((bg) => (
                          <SelectItem key={bg.id} value={bg.id}>{bg.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving || !editState.name.trim()}>
              {isSaving ? '...' : tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy from Year Group Dialog */}
      <Dialog open={copyYgOpen} onOpenChange={setCopyYgOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tv('copyFromYearGroup')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{tv('sourceYearGroup')}</Label>
              <Select value={copySourceYg} onValueChange={setCopySourceYg}>
                <SelectTrigger><SelectValue placeholder={tv('selectYearGroup')} /></SelectTrigger>
                <SelectContent>
                  {yearGroups
                    .filter((yg) => yg.id !== selectedYearGroup)
                    .map((yg) => (
                      <SelectItem key={yg.id} value={yg.id}>{yg.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyYgOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={() => void handleCopyFromYearGroup()} disabled={!copySourceYg}>
              {tv('copy')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
