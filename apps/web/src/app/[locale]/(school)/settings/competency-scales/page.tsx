'use client';

import { BookOpen, ChevronDown, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  toast,
} from '@school/ui';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CompetencyLevel {
  label: string;
  threshold_min: number;
}

interface CompetencyScale {
  id: string;
  name: string;
  levels: CompetencyLevel[];
}

interface ScalesResponse {
  data: CompetencyScale[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompetencyScalesPage() {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');

  const [data, setData] = React.useState<CompetencyScale[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<CompetencyScale | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  // Form state
  const [name, setName] = React.useState('');
  const [levels, setLevels] = React.useState<CompetencyLevel[]>([
    { label: 'Beginning', threshold_min: 0 },
    { label: 'Developing', threshold_min: 40 },
    { label: 'Proficient', threshold_min: 70 },
    { label: 'Mastered', threshold_min: 90 },
  ]);

  const fetchScales = React.useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      const res = await apiClient<ScalesResponse>(
        `/api/v1/gradebook/competency-scales?${params.toString()}`,
      );
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

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetForm = () => {
    setName('');
    setLevels([
      { label: 'Beginning', threshold_min: 0 },
      { label: 'Developing', threshold_min: 40 },
      { label: 'Proficient', threshold_min: 70 },
      { label: 'Mastered', threshold_min: 90 },
    ]);
  };

  const openCreate = () => {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  };

  const openEdit = (scale: CompetencyScale) => {
    setEditTarget(scale);
    setName(scale.name);
    setLevels(scale.levels.length > 0 ? [...scale.levels] : [{ label: '', threshold_min: 0 }]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || levels.length === 0) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), levels };
      if (editTarget) {
        await apiClient(`/api/v1/gradebook/competency-scales/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/gradebook/competency-scales', {
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

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/v1/gradebook/competency-scales/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      void fetchScales(page);
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const addLevel = () => {
    setLevels((prev) => [...prev, { label: '', threshold_min: 0 }]);
  };

  const removeLevel = (idx: number) => {
    setLevels((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateLevel = (idx: number, field: keyof CompetencyLevel, value: string) => {
    setLevels((prev) =>
      prev.map((lv, i) =>
        i === idx ? { ...lv, [field]: field === 'threshold_min' ? Number(value) : value } : lv,
      ),
    );
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Color gradient for competency levels
  const LEVEL_COLORS = [
    'bg-danger-100 text-danger-text border-danger-200',
    'bg-warning-100 text-warning-text border-warning-200',
    'bg-success-100 text-success-text border-success-200',
    'bg-primary-100 text-primary-700 border-primary-200',
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('competencyScales')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            {tc('create')}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={BookOpen} title={t('noCompetencyScales')} />
      ) : (
        <div className="space-y-3">
          {data.map((scale) => {
            const isExpanded = expandedIds.has(scale.id);
            return (
              <div
                key={scale.id}
                className="rounded-xl border border-border bg-surface overflow-hidden"
              >
                {/* Header */}
                <div className="flex items-center justify-between gap-4 p-5">
                  <button
                    className="flex flex-1 items-center gap-2 text-start"
                    onClick={() => toggleExpanded(scale.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" />
                    )}
                    <span className="font-semibold text-text-primary">{scale.name}</span>
                    <span className="text-sm text-text-secondary">
                      — {scale.levels.length} {t('levels')}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(scale)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(scale.id)}>
                      <Trash2 className="h-4 w-4 text-danger-text" />
                    </Button>
                  </div>
                </div>

                {/* Expanded levels */}
                {isExpanded && (
                  <div className="border-t border-border bg-surface-secondary/40 px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      {scale.levels.map((lv, i) => (
                        <div
                          key={i}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${LEVEL_COLORS[i % LEVEL_COLORS.length]}`}
                        >
                          <span className="font-semibold">{lv.label}</span>
                          <span className="text-xs opacity-75">≥{lv.threshold_min}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {tc('previous')}
          </Button>
          <span className="text-sm text-text-secondary">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {tc('next')}
          </Button>
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? tc('edit') : tc('create')} {t('competencyScale')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <Label htmlFor="scale-name">{tc('name')}</Label>
              <Input
                id="scale-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard Mastery Scale"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('levels')}</Label>
                <Button variant="ghost" size="sm" onClick={addLevel}>
                  <Plus className="me-1 h-3 w-3" />
                  Add level
                </Button>
              </div>
              <p className="text-xs text-text-secondary">
                Levels are applied bottom-up. A score ≥ threshold qualifies for that level.
              </p>

              {levels.map((lv, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={lv.label}
                    onChange={(e) => updateLevel(i, 'label', e.target.value)}
                    placeholder="Level label"
                    className="flex-1"
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-text-secondary">≥</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={String(lv.threshold_min)}
                      onChange={(e) => updateLevel(i, 'threshold_min', e.target.value)}
                      className="w-20"
                      placeholder="%"
                    />
                    <span className="text-xs text-text-secondary">%</span>
                  </div>
                  {levels.length > 1 && (
                    <Button variant="ghost" size="sm" onClick={() => removeLevel(i)}>
                      <Trash2 className="h-3.5 w-3.5 text-danger-text" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim() || levels.length === 0}>
              {saving ? tc('loading') : tc('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tc('confirmDelete')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">{t('deleteScaleConfirm')}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
              {tc('cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId && void handleDelete(confirmDeleteId)}
            >
              {tc('delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
