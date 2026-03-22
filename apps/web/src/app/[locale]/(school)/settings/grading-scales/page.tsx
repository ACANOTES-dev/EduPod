'use client';

import {
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  toast,
} from '@school/ui';
import { Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';


import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScaleRange {
  min: number;
  max: number;
  label: string;
}

interface ScaleGrade {
  label: string;
  numeric_value?: number;
}

interface GradingScale {
  id: string;
  name: string;
  config_json: {
    type: string;
    ranges?: ScaleRange[];
    grades?: ScaleGrade[];
    passing_threshold?: number;
  };
  is_in_use?: boolean;
}

interface GradingScalesResponse {
  data: GradingScale[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function GradingScalesPage() {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');
  const ts = useTranslations('settings');

  const [data, setData] = React.useState<GradingScale[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<GradingScale | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Form state
  const [name, setName] = React.useState('');
  const [scaleType, setScaleType] = React.useState('numeric');
  const [ranges, setRanges] = React.useState<ScaleRange[]>([
    { min: 0, max: 59, label: 'F' },
    { min: 60, max: 100, label: 'A' },
  ]);
  const [grades, setGrades] = React.useState<ScaleGrade[]>([
    { label: 'Excellent' },
    { label: 'Good' },
  ]);

  const fetchScales = React.useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      const res = await apiClient<GradingScalesResponse>(`/api/v1/gradebook/grading-scales?${params.toString()}`);
      setData(res.data);
      setTotal(res.meta.total);
    } catch {
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchScales(page);
  }, [page, fetchScales]);

  const resetForm = React.useCallback(() => {
    setName('');
    setScaleType('numeric');
    setRanges([
      { min: 0, max: 59, label: 'F' },
      { min: 60, max: 100, label: 'A' },
    ]);
    setGrades([
      { label: 'Excellent' },
      { label: 'Good' },
    ]);
  }, []);

  const openCreate = React.useCallback(() => {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  }, [resetForm]);

  const openEdit = React.useCallback((scale: GradingScale) => {
    setEditTarget(scale);
    setName(scale.name);
    const cfg = scale.config_json;
    setScaleType(cfg.type);
    if (cfg.type === 'numeric' && Array.isArray(cfg.ranges)) {
      setRanges(cfg.ranges);
    } else if (Array.isArray(cfg.grades)) {
      setGrades(cfg.grades);
    }
    setDialogOpen(true);
  }, []);

  const buildConfigJson = React.useCallback(() => {
    if (scaleType === 'numeric') {
      return { type: scaleType, ranges };
    }
    return { type: scaleType, grades };
  }, [scaleType, ranges, grades]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), config_json: buildConfigJson() };
      if (editTarget) {
        await apiClient(`/api/v1/gradebook/grading-scales/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/gradebook/grading-scales', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setDialogOpen(false);
      void fetchScales(page);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (scale: GradingScale) => {
    if (scale.is_in_use) return;
    try {
      await apiClient(`/api/v1/gradebook/grading-scales/${scale.id}`, { method: 'DELETE' });
      void fetchScales(page);
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const addRange = () => {
    setRanges((prev) => [...prev, { min: 0, max: 100, label: '' }]);
  };

  const removeRange = (idx: number) => {
    setRanges((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateRange = (idx: number, field: keyof ScaleRange, value: string) => {
    setRanges((prev) =>
      prev.map((r, i) =>
        i === idx
          ? { ...r, [field]: field === 'label' ? value : Number(value) }
          : r,
      ),
    );
  };

  const addGrade = () => {
    setGrades((prev) => [...prev, { label: '' }]);
  };

  const removeGrade = (idx: number) => {
    setGrades((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateGrade = (idx: number, value: string) => {
    setGrades((prev) =>
      prev.map((g, i) => (i === idx ? { ...g, label: value } : g)),
    );
  };

  const columns = [
    {
      key: 'name',
      header: ts('gradingScales'),
      render: (row: GradingScale) => (
        <span className="font-medium text-text-primary">{row.name}</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row: GradingScale) => (
        <span className="text-text-secondary capitalize">{row.config_json.type}</span>
      ),
    },
    {
      key: 'in_use',
      header: 'Status',
      render: (row: GradingScale) =>
        row.is_in_use ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center gap-1 text-warning-text">
                  <Lock className="h-3.5 w-3.5" />
                  {t('inUse')}
                </span>
              </TooltipTrigger>
              <TooltipContent>{t('scaleImmutable')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: GradingScale) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(row);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={row.is_in_use}
            onClick={(e) => {
              e.stopPropagation();
              void handleDelete(row);
            }}
          >
            <Trash2 className="h-4 w-4 text-danger-text" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={ts('gradingScales')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            {tc('create')}
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editTarget ? tc('edit') : tc('create')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="scale-name">Name</Label>
              <Input
                id="scale-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard Numeric"
              />
            </div>

            <div>
              <Label>Type</Label>
              <Select
                value={scaleType}
                onValueChange={setScaleType}
                disabled={!!editTarget}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="numeric">Numeric</SelectItem>
                  <SelectItem value="letter">Letter</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {scaleType === 'numeric' ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Ranges</Label>
                  <Button variant="ghost" size="sm" onClick={addRange}>
                    <Plus className="me-1 h-3 w-3" />
                    Add
                  </Button>
                </div>
                {ranges.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={String(r.min)}
                      onChange={(e) => updateRange(idx, 'min', e.target.value)}
                      className="w-20"
                      placeholder="Min"
                    />
                    <span className="text-text-tertiary">–</span>
                    <Input
                      type="number"
                      value={String(r.max)}
                      onChange={(e) => updateRange(idx, 'max', e.target.value)}
                      className="w-20"
                      placeholder="Max"
                    />
                    <Input
                      value={r.label}
                      onChange={(e) => updateRange(idx, 'label', e.target.value)}
                      className="flex-1"
                      placeholder="Label (e.g. A)"
                    />
                    {ranges.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRange(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger-text" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Grades</Label>
                  <Button variant="ghost" size="sm" onClick={addGrade}>
                    <Plus className="me-1 h-3 w-3" />
                    Add
                  </Button>
                </div>
                {grades.map((g, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Input
                      value={g.label}
                      onChange={(e) => updateGrade(idx, e.target.value)}
                      className="flex-1"
                      placeholder="Grade label (e.g. Excellent)"
                    />
                    {grades.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeGrade(idx)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-danger-text" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? tc('loading') : tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
