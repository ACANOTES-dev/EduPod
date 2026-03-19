'use client';

import { Copy, Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
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

interface AcademicYear { id: string; name: string }

interface TeacherConfigRow {
  id: string;
  staff_profile_id: string;
  teacher_name: string;
  max_periods_per_week: number | null;
  max_periods_per_day: number | null;
  max_supervision_duties_per_week: number | null;
}

interface EditableRow extends TeacherConfigRow {
  dirty: boolean;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TeacherConfigPage() {
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [rows, setRows] = React.useState<EditableRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // Load reference data
  React.useEffect(() => {
    apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20')
      .then((res) => {
        setAcademicYears(res.data);
        if (res.data[0]) setSelectedYear(res.data[0].id);
      })
      .catch(() => toast.error(tc('errorGeneric')));
  }, [tc]);

  // Fetch teacher configs
  const fetchData = React.useCallback(async () => {
    if (!selectedYear) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ academic_year_id: selectedYear });
      const res = await apiClient<{ data: TeacherConfigRow[] }>(`/api/v1/scheduling/teacher-config?${params.toString()}`);
      setRows(res.data.map((r) => ({ ...r, dirty: false })));
    } catch {
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const updateField = (index: number, field: keyof TeacherConfigRow, value: string) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        const numVal = value === '' ? null : Number(value);
        return { ...r, [field]: numVal, dirty: true };
      })
    );
  };

  const handleSaveAll = async () => {
    const dirtyRows = rows.filter((r) => r.dirty);
    if (dirtyRows.length === 0) return;
    setIsSaving(true);
    try {
      await Promise.all(
        dirtyRows.map((row) =>
          apiClient(`/api/v1/scheduling/teacher-config/${row.id}`, {
            method: 'PATCH',
            body: JSON.stringify({
              max_periods_per_week: row.max_periods_per_week,
              max_periods_per_day: row.max_periods_per_day,
              max_supervision_duties_per_week: row.max_supervision_duties_per_week,
            }),
          })
        )
      );
      setRows((prev) => prev.map((r) => ({ ...r, dirty: false })));
      toast.success(tc('save'));
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopyFromYear = async (sourceYearId: string) => {
    try {
      await apiClient('/api/v1/scheduling/teacher-config/copy', {
        method: 'POST',
        body: JSON.stringify({
          source_academic_year_id: sourceYearId,
          target_academic_year_id: selectedYear,
        }),
      });
      toast.success(tv('copiedFromYear'));
      void fetchData();
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const hasDirtyRows = rows.some((r) => r.dirty);

  return (
    <div className="space-y-6">
      <PageHeader
        title={tv('teacherConfig')}
        description={tv('teacherConfigDesc')}
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
            <Select onValueChange={(v) => void handleCopyFromYear(v)}>
              <SelectTrigger className="w-auto h-8 text-xs">
                <Copy className="me-1.5 h-3 w-3" />
                <SelectValue placeholder={tv('copyFromYear')} />
              </SelectTrigger>
              <SelectContent>
                {academicYears.filter((y) => y.id !== selectedYear).map((y) => (
                  <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasDirtyRows && (
              <Button size="sm" onClick={() => void handleSaveAll()} disabled={isSaving}>
                <Save className="me-1.5 h-3.5 w-3.5" />
                {isSaving ? '...' : tc('save')}
              </Button>
            )}
          </div>
        }
      />

      {/* Table */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-secondary">
                <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('teacherName')}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('maxPerWeek')}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('maxPerDay')}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('maxSupervision')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-text-tertiary">{tc('loading')}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-text-tertiary">{tv('noTeacherConfig')}</td></tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row.id} className={`border-t border-border ${row.dirty ? 'bg-amber-50/50 dark:bg-amber-900/10' : 'hover:bg-surface-secondary/50'}`}>
                    <td className="px-4 py-3 font-medium text-text-primary">{row.teacher_name}</td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={0}
                        className="w-20 h-8 text-sm"
                        value={row.max_periods_per_week ?? ''}
                        onChange={(e) => updateField(idx, 'max_periods_per_week', e.target.value)}
                        placeholder={tv('noLimit')}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={0}
                        className="w-20 h-8 text-sm"
                        value={row.max_periods_per_day ?? ''}
                        onChange={(e) => updateField(idx, 'max_periods_per_day', e.target.value)}
                        placeholder={tv('noLimit')}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={0}
                        className="w-20 h-8 text-sm"
                        value={row.max_supervision_duties_per_week ?? ''}
                        onChange={(e) => updateField(idx, 'max_supervision_duties_per_week', e.target.value)}
                        placeholder={tv('noLimit')}
                      />
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
