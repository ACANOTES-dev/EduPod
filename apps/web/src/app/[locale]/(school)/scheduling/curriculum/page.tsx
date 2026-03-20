'use client';

import { AlertTriangle, Copy, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Badge,
  Button,
  Checkbox,
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

interface AcademicYear { id: string; name: string }
interface YearGroup { id: string; name: string }
interface Subject { id: string; name: string; code: string }

interface CurriculumRow {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string;
  min_periods_per_week: number;
  max_periods_per_day: number;
  preferred_periods_per_week: number | null;
  requires_double_period: boolean;
  double_period_count: number | null;
}

interface EditForm {
  id: string | null;
  subject_id: string;
  min_periods_per_week: string;
  max_periods_per_day: string;
  preferred_periods_per_week: string;
  requires_double_period: boolean;
  double_period_count: string;
}

const EMPTY_FORM: EditForm = {
  id: null,
  subject_id: '',
  min_periods_per_week: '1',
  max_periods_per_day: '1',
  preferred_periods_per_week: '',
  requires_double_period: false,
  double_period_count: '',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CurriculumPage() {
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [subjects, setSubjects] = React.useState<Subject[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [selectedYearGroup, setSelectedYearGroup] = React.useState('');
  const [rows, setRows] = React.useState<CurriculumRow[]>([]);
  const [totalTeachingPeriods, setTotalTeachingPeriods] = React.useState(0);
  const [isLoading, setIsLoading] = React.useState(false);

  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<EditForm>(EMPTY_FORM);
  const [isSaving, setIsSaving] = React.useState(false);

  // Load reference data
  React.useEffect(() => {
    Promise.all([
      apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20'),
      apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100'),
      apiClient<{ data: Subject[] }>('/api/v1/subjects?pageSize=100'),
    ]).then(([yearsRes, ygRes, subRes]) => {
      setAcademicYears(yearsRes.data);
      setYearGroups(ygRes.data);
      setSubjects(subRes.data);
      if (yearsRes.data[0]) setSelectedYear(yearsRes.data[0].id);
      if (ygRes.data[0]) setSelectedYearGroup(ygRes.data[0].id);
    }).catch(() => toast.error(tc('errorGeneric')));
  }, [tc]);

  // Fetch curriculum rows
  const fetchData = React.useCallback(async () => {
    if (!selectedYear || !selectedYearGroup) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        academic_year_id: selectedYear,
        year_group_id: selectedYearGroup,
      });
      const [currRes, gridRes] = await Promise.all([
        apiClient<{ data: CurriculumRow[] }>(`/api/v1/scheduling/curriculum-requirements?${params.toString()}`),
        apiClient<{ total_teaching_periods: number }>(`/api/v1/period-grid/teaching-count?${params.toString()}`).catch(() => ({ total_teaching_periods: 0 })),
      ]);
      setRows(currRes.data);
      setTotalTeachingPeriods(gridRes.total_teaching_periods ?? 0);
    } catch {
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, selectedYearGroup]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const totalAllocated = rows.reduce((sum, r) => sum + r.min_periods_per_week, 0);
  const remaining = totalTeachingPeriods - totalAllocated;
  const overCapacity = remaining < 0;

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row: CurriculumRow) => {
    setForm({
      id: row.id,
      subject_id: row.subject_id,
      min_periods_per_week: String(row.min_periods_per_week),
      max_periods_per_day: String(row.max_periods_per_day),
      preferred_periods_per_week: row.preferred_periods_per_week != null ? String(row.preferred_periods_per_week) : '',
      requires_double_period: row.requires_double_period,
      double_period_count: row.double_period_count != null ? String(row.double_period_count) : '',
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.subject_id || !selectedYear || !selectedYearGroup) return;
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        academic_year_id: selectedYear,
        year_group_id: selectedYearGroup,
        subject_id: form.subject_id,
        min_periods_per_week: Number(form.min_periods_per_week),
        max_periods_per_day: Number(form.max_periods_per_day),
        preferred_periods_per_week: form.preferred_periods_per_week ? Number(form.preferred_periods_per_week) : null,
        requires_double_period: form.requires_double_period,
        double_period_count: form.requires_double_period && form.double_period_count ? Number(form.double_period_count) : null,
      };

      if (form.id) {
        await apiClient(`/api/v1/scheduling/curriculum-requirements/${form.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/scheduling/curriculum-requirements', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setFormOpen(false);
      void fetchData();
      toast.success(tc('save'));
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/v1/scheduling/curriculum-requirements/${id}`, { method: 'DELETE' });
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success(tc('delete'));
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const handleCopyFromYearGroup = async (sourceYgId: string) => {
    try {
      await apiClient('/api/v1/scheduling/curriculum-requirements/copy', {
        method: 'POST',
        body: JSON.stringify({
          academic_year_id: selectedYear,
          source_year_group_id: sourceYgId,
          target_year_group_id: selectedYearGroup,
        }),
      });
      toast.success(tv('copiedFromYearGroup'));
      void fetchData();
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={tv('curriculum')}
        description={tv('curriculumDesc')}
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

      {selectedYearGroup && (
        <>
          {/* Capacity indicator + actions */}
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" onClick={openAdd}>
              <Plus className="me-1.5 h-3.5 w-3.5" />
              {tv('addSubject')}
            </Button>
            <Select onValueChange={(v) => void handleCopyFromYearGroup(v)}>
              <SelectTrigger className="w-auto h-8 text-xs">
                <Copy className="me-1.5 h-3 w-3" />
                <SelectValue placeholder={tv('copyFromYearGroup')} />
              </SelectTrigger>
              <SelectContent>
                {yearGroups.filter((yg) => yg.id !== selectedYearGroup).map((yg) => (
                  <SelectItem key={yg.id} value={yg.id}>{yg.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className={`ms-auto text-sm font-medium ${overCapacity ? 'text-red-600 dark:text-red-400' : 'text-text-secondary'}`}>
              {tv('totalAllocated')}: {totalAllocated} / {totalTeachingPeriods}.{' '}
              {tv('remaining')}: {remaining}
            </span>
          </div>

          {overCapacity && (
            <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-700 px-4 py-3 flex items-center gap-3">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <span className="text-sm text-red-800 dark:text-red-300">{tv('overCapacityWarning')}</span>
            </div>
          )}

          {/* Table */}
          <div className="rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-secondary">
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('subject')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('minPerWeek')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('maxPerDay')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('preferredPerWeek')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('doublePeriod')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('doubleCount')}</th>
                    <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tc('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-text-tertiary">{tc('loading')}</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-text-tertiary">{tv('noRequirements')}</td></tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="border-t border-border hover:bg-surface-secondary/50">
                        <td className="px-4 py-3 font-medium text-text-primary">
                          {row.subject_name ?? '—'}
                          <span className="ms-2 text-xs text-text-tertiary font-mono">{row.subject_code}</span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{row.min_periods_per_week}</td>
                        <td className="px-4 py-3 text-text-secondary">{row.max_periods_per_day}</td>
                        <td className="px-4 py-3 text-text-secondary">{row.preferred_periods_per_week ?? '-'}</td>
                        <td className="px-4 py-3">
                          {row.requires_double_period ? (
                            <Badge variant="default">{tv('yes')}</Badge>
                          ) : (
                            <span className="text-text-tertiary">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{row.double_period_count ?? '-'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                              {tc('edit')}
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => void handleDelete(row.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
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

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? tc('edit') : tv('addSubject')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>{tv('subject')}</Label>
              <Select value={form.subject_id} onValueChange={(v) => setForm((f) => ({ ...f, subject_id: v }))} disabled={!!form.id}>
                <SelectTrigger><SelectValue placeholder={tv('selectSubject')} /></SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tv('minPerWeek')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.min_periods_per_week}
                  onChange={(e) => setForm((f) => ({ ...f, min_periods_per_week: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{tv('maxPerDay')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.max_periods_per_day}
                  onChange={(e) => setForm((f) => ({ ...f, max_periods_per_day: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{tv('preferredPerWeek')}</Label>
              <Input
                type="number"
                min={0}
                value={form.preferred_periods_per_week}
                onChange={(e) => setForm((f) => ({ ...f, preferred_periods_per_week: e.target.value }))}
                placeholder={tv('optional')}
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="double-period"
                checked={form.requires_double_period}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, requires_double_period: checked === true }))}
              />
              <Label htmlFor="double-period">{tv('doublePeriod')}</Label>
            </div>
            {form.requires_double_period && (
              <div className="space-y-1.5">
                <Label>{tv('doubleCount')}</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.double_period_count}
                  onChange={(e) => setForm((f) => ({ ...f, double_period_count: e.target.value }))}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving || !form.subject_id}>
              {isSaving ? '...' : tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
