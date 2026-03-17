'use client';

import { Copy, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

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

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear {
  id: string;
  name: string;
}

type PeriodType = 'teaching' | 'break' | 'assembly' | 'lunch' | 'free';

interface PeriodSlot {
  id: string;
  academic_year_id: string;
  weekday: number;
  sort_order: number;
  name: string;
  name_ar: string | null;
  start_time: string;
  end_time: string;
  period_type: PeriodType;
}

interface PeriodGridResponse {
  data: PeriodSlot[];
}

interface EditState {
  id: string | null;
  weekday: number;
  name: string;
  name_ar: string;
  start_time: string;
  end_time: string;
  period_type: PeriodType;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const; // Mon–Sat, Sun
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
  teaching: 'bg-blue-50 border-blue-200 text-blue-700',
  break: 'bg-amber-50 border-amber-200 text-amber-700',
  assembly: 'bg-purple-50 border-purple-200 text-purple-700',
  lunch: 'bg-orange-50 border-orange-200 text-orange-700',
  free: 'bg-surface-secondary border-border text-text-tertiary',
};

const TYPE_BADGE_VARIANT: Record<PeriodType, 'default' | 'outline'> = {
  teaching: 'default',
  break: 'outline',
  assembly: 'outline',
  lunch: 'outline',
  free: 'outline',
};

const EMPTY_EDIT: EditState = {
  id: null,
  weekday: 1,
  name: '',
  name_ar: '',
  start_time: '08:00',
  end_time: '09:00',
  period_type: 'teaching',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PeriodGridPage() {
  const t = useTranslations('scheduling');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [periods, setPeriods] = React.useState<PeriodSlot[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const [editOpen, setEditOpen] = React.useState(false);
  const [editState, setEditState] = React.useState<EditState>(EMPTY_EDIT);
  const [isSaving, setIsSaving] = React.useState(false);

  // Load academic years on mount
  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20')
      .then((res) => {
        setAcademicYears(res.data);
        if (res.data.length > 0 && res.data[0]) {
          setSelectedYear(res.data[0].id);
        }
      })
      .catch(() => toast.error('Failed to load academic years'));
  }, []);

  // Load period grid when year changes
  React.useEffect(() => {
    if (!selectedYear) return;
    setIsLoading(true);
    apiClient<PeriodGridResponse>(`/api/v1/period-grid?academic_year_id=${selectedYear}`)
      .then((res) => setPeriods(res.data))
      .catch(() => toast.error('Failed to load period grid'))
      .finally(() => setIsLoading(false));
  }, [selectedYear]);

  const periodsForDay = (weekday: number) =>
    periods
      .filter((p) => p.weekday === weekday)
      .sort((a, b) => a.sort_order - b.sort_order);

  const openAdd = (weekday: number) => {
    setEditState({
      ...EMPTY_EDIT,
      id: null,
      weekday,
    });
    setEditOpen(true);
  };

  const openEdit = (period: PeriodSlot) => {
    setEditState({
      id: period.id,
      weekday: period.weekday,
      name: period.name,
      name_ar: period.name_ar ?? '',
      start_time: period.start_time,
      end_time: period.end_time,
      period_type: period.period_type,
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editState.name.trim() || !selectedYear) return;
    setIsSaving(true);
    try {
      if (editState.id) {
        const updated = await apiClient<PeriodSlot>(`/api/v1/period-grid/${editState.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            name: editState.name,
            name_ar: editState.name_ar || null,
            start_time: editState.start_time,
            end_time: editState.end_time,
            period_type: editState.period_type,
          }),
        });
        setPeriods((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } else {
        const dayPeriods = periodsForDay(editState.weekday);
        const created = await apiClient<PeriodSlot>('/api/v1/period-grid', {
          method: 'POST',
          body: JSON.stringify({
            academic_year_id: selectedYear,
            weekday: editState.weekday,
            sort_order: dayPeriods.length + 1,
            name: editState.name,
            name_ar: editState.name_ar || null,
            start_time: editState.start_time,
            end_time: editState.end_time,
            period_type: editState.period_type,
          }),
        });
        setPeriods((prev) => [...prev, created]);
      }
      setEditOpen(false);
      toast.success(editState.id ? 'Period updated' : 'Period added');
    } catch {
      toast.error('Failed to save period');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/v1/period-grid/${id}`, { method: 'DELETE' });
      setPeriods((prev) => prev.filter((p) => p.id !== id));
      toast.success('Period deleted');
    } catch {
      toast.error('Failed to delete period');
    }
  };

  const handleCopyDay = async (fromWeekday: number, toWeekday: number) => {
    try {
      await apiClient<PeriodGridResponse>('/api/v1/period-grid/copy-day', {
        method: 'POST',
        body: JSON.stringify({
          academic_year_id: selectedYear,
          from_weekday: fromWeekday,
          to_weekday: toWeekday,
        }),
      });
      // Refresh full grid after copy
      const refreshed = await apiClient<PeriodGridResponse>(
        `/api/v1/period-grid?academic_year_id=${selectedYear}`,
      );
      setPeriods(refreshed.data);
      toast.success('Day copied');
    } catch {
      toast.error('Failed to copy day');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('auto.periodGrid')}
        description={t('auto.periodGridDesc')}
        actions={
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select year" />
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
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      {t(WEEKDAY_LABELS[weekday])}
                    </span>
                    <Select
                      onValueChange={(toDay) => {
                        void handleCopyDay(weekday, parseInt(toDay, 10));
                      }}
                    >
                      <SelectTrigger className="h-6 w-6 border-0 p-0 opacity-50 hover:opacity-100">
                        <Copy className="h-3 w-3" />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.filter((d) => d !== weekday).map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            Copy to {t(WEEKDAY_LABELS[d])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {dayPeriods.map((period) => (
                    <div
                      key={period.id}
                      className={`group relative cursor-pointer rounded-md border p-2 text-xs transition-all hover:shadow-sm ${TYPE_STYLES[period.period_type]}`}
                      onClick={() => openEdit(period)}
                    >
                      <div className="font-medium">{period.name}</div>
                      <div className="mt-0.5 font-mono text-[10px] opacity-70">
                        {period.start_time} – {period.end_time}
                      </div>
                      <Badge
                        variant={TYPE_BADGE_VARIANT[period.period_type]}
                        className="mt-1 text-[10px] capitalize"
                      >
                        {period.period_type}
                      </Badge>
                      <button
                        className="absolute end-1 top-1 hidden rounded p-0.5 hover:bg-red-100 group-hover:flex"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(period.id);
                        }}
                        aria-label="Delete"
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
                    Add
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit / Add Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editState.id ? 'Edit Period' : 'Add Period'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={editState.name}
                  onChange={(e) => setEditState((s) => ({ ...s, name: e.target.value }))}
                  placeholder="e.g. Period 1"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Name (Arabic)</Label>
                <Input
                  value={editState.name_ar}
                  onChange={(e) => setEditState((s) => ({ ...s, name_ar: e.target.value }))}
                  placeholder="الحصة الأولى"
                  dir="rtl"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={editState.start_time}
                  onChange={(e) => setEditState((s) => ({ ...s, start_time: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={editState.end_time}
                  onChange={(e) => setEditState((s) => ({ ...s, end_time: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={editState.period_type}
                onValueChange={(v) =>
                  setEditState((s) => ({ ...s, period_type: v as PeriodType }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="teaching">Teaching</SelectItem>
                  <SelectItem value="break">Break</SelectItem>
                  <SelectItem value="assembly">Assembly</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="free">Free</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving || !editState.name.trim()}>
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
