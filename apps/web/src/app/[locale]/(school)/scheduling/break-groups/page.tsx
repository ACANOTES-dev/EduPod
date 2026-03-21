'use client';

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
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AcademicYear { id: string; name: string }
interface YearGroup { id: string; name: string }

interface BreakGroupRow {
  id: string;
  name: string;
  name_ar: string | null;
  location: string | null;
  required_supervisor_count: number;
  year_groups: Array<{ id: string; name: string }>;
}

interface FormState {
  id: string | null;
  name: string;
  name_ar: string;
  location: string;
  required_supervisor_count: string;
  year_group_ids: string[];
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  name_ar: '',
  location: '',
  required_supervisor_count: '1',
  year_group_ids: [],
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BreakGroupsPage() {
  const tv = useTranslations('scheduling.v2');
  const tc = useTranslations('common');

  const [academicYears, setAcademicYears] = React.useState<AcademicYear[]>([]);
  const [yearGroups, setYearGroups] = React.useState<YearGroup[]>([]);
  const [selectedYear, setSelectedYear] = React.useState('');
  const [rows, setRows] = React.useState<BreakGroupRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const [formOpen, setFormOpen] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [isSaving, setIsSaving] = React.useState(false);

  // Load reference data
  React.useEffect(() => {
    Promise.all([
      apiClient<{ data: AcademicYear[] }>('/api/v1/academic-years?pageSize=20'),
      apiClient<{ data: YearGroup[] }>('/api/v1/year-groups?pageSize=100'),
    ]).then(([yearsRes, ygRes]) => {
      setAcademicYears(yearsRes.data);
      setYearGroups(ygRes.data);
      if (yearsRes.data[0]) setSelectedYear(yearsRes.data[0].id);
    }).catch(() => toast.error(tc('errorGeneric')));
  }, [tc]);

  // Fetch break groups
  const fetchData = React.useCallback(async () => {
    if (!selectedYear) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ academic_year_id: selectedYear });
      const res = await apiClient<{ data: BreakGroupRow[] }>(`/api/v1/scheduling/break-groups?${params.toString()}`);
      setRows(res.data);
    } catch {
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (row: BreakGroupRow) => {
    setForm({
      id: row.id,
      name: row.name,
      name_ar: row.name_ar ?? '',
      location: row.location ?? '',
      required_supervisor_count: String(row.required_supervisor_count),
      year_group_ids: row.year_groups.map((yg) => yg.id),
    });
    setFormOpen(true);
  };

  const toggleYearGroup = (ygId: string) => {
    setForm((f) => ({
      ...f,
      year_group_ids: f.year_group_ids.includes(ygId)
        ? f.year_group_ids.filter((id) => id !== ygId)
        : [...f.year_group_ids, ygId],
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim() || !selectedYear) return;
    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        academic_year_id: selectedYear,
        name: form.name,
        name_ar: form.name_ar || null,
        location: form.location || null,
        required_supervisor_count: Number(form.required_supervisor_count),
        year_group_ids: form.year_group_ids,
      };

      if (form.id) {
        await apiClient(`/api/v1/scheduling/break-groups/${form.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/scheduling/break-groups', {
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
      await apiClient(`/api/v1/scheduling/break-groups/${id}`, { method: 'DELETE' });
      setRows((prev) => prev.filter((r) => r.id !== id));
      toast.success(tc('delete'));
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={tv('breakGroups')}
        description={tv('breakGroupsDesc')}
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
            <Button size="sm" onClick={openAdd}>
              <Plus className="me-1.5 h-3.5 w-3.5" />
              {tv('addBreakGroup')}
            </Button>
          </div>
        }
      />

      {/* Table */}
      <div className="rounded-2xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-secondary">
                <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('bgName')}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('bgLocation')}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('bgSupervisors')}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tv('bgYearGroups')}</th>
                <th className="px-4 py-3 text-start text-xs font-medium text-text-tertiary uppercase">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-text-tertiary">{tc('loading')}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-text-tertiary">{tv('noBreakGroups')}</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-border hover:bg-surface-secondary/50">
                    <td className="px-4 py-3 font-medium text-text-primary">
                      {row.name}
                      {row.name_ar && (
                        <span className="ms-2 text-xs text-text-tertiary" dir="rtl">{row.name_ar}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-text-secondary">{row.location ?? '-'}</td>
                    <td className="px-4 py-3 text-text-secondary">{row.required_supervisor_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.year_groups.map((yg) => (
                          <Badge key={yg.id} variant="secondary" className="text-xs">{yg.name}</Badge>
                        ))}
                        {row.year_groups.length === 0 && (
                          <span className="text-text-tertiary">-</span>
                        )}
                      </div>
                    </td>
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

      {/* Add/Edit Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? tc('edit') : tv('addBreakGroup')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{tv('bgName')}</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={tv('bgNamePlaceholder')}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{tv('bgNameAr')}</Label>
                <Input
                  value={form.name_ar}
                  onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))}
                  dir="rtl"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{tv('bgLocation')}</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                placeholder={tv('bgLocationPlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tv('bgSupervisors')}</Label>
              <Input
                type="number"
                min={1}
                value={form.required_supervisor_count}
                onChange={(e) => setForm((f) => ({ ...f, required_supervisor_count: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tv('bgYearGroups')}</Label>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-lg border border-border p-3">
                {yearGroups.map((yg) => (
                  <div key={yg.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`yg-${yg.id}`}
                      checked={form.year_group_ids.includes(yg.id)}
                      onCheckedChange={() => toggleYearGroup(yg.id)}
                    />
                    <Label htmlFor={`yg-${yg.id}`} className="text-sm">{yg.name}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={() => void handleSave()} disabled={isSaving || !form.name.trim()}>
              {isSaving ? '...' : tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
