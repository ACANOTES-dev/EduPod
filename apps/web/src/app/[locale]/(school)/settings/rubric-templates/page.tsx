'use client';

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
import { BookOpen, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import * as React from 'react';

import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RubricLevel {
  label: string;
  points: number;
  description: string;
}

interface RubricCriterion {
  id: string;
  name: string;
  max_points: number;
  levels: RubricLevel[];
}

interface RubricTemplate {
  id: string;
  name: string;
  criteria: RubricCriterion[];
  subject?: { id: string; name: string } | null;
}

interface RubricTemplatesResponse {
  data: RubricTemplate[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nanoid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function defaultCriterion(): RubricCriterion {
  return {
    id: nanoid(),
    name: '',
    max_points: 10,
    levels: [
      { label: 'Excellent', points: 10, description: '' },
      { label: 'Good', points: 7, description: '' },
      { label: 'Needs Improvement', points: 4, description: '' },
    ],
  };
}

// ─── Criterion Editor ────────────────────────────────────────────────────────

interface CriterionEditorProps {
  criterion: RubricCriterion;
  index: number;
  total: number;
  onChange: (c: RubricCriterion) => void;
  onMove: (index: number, dir: 'up' | 'down') => void;
  onRemove: (index: number) => void;
}

function CriterionEditor({ criterion, index, total, onChange, onMove, onRemove }: CriterionEditorProps) {
  const updateLevel = (li: number, field: keyof RubricLevel, value: string) => {
    const next = criterion.levels.map((lv, i) =>
      i === li
        ? { ...lv, [field]: field === 'points' ? Number(value) : value }
        : lv,
    );
    onChange({ ...criterion, levels: next });
  };

  const addLevel = () => {
    onChange({
      ...criterion,
      levels: [...criterion.levels, { label: '', points: 0, description: '' }],
    });
  };

  const removeLevel = (li: number) => {
    onChange({ ...criterion, levels: criterion.levels.filter((_, i) => i !== li) });
  };

  return (
    <div className="rounded-lg border border-border bg-surface-secondary/40 p-4 space-y-3">
      {/* Criterion header */}
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={index === 0}
            onClick={() => onMove(index, 'up')}
            className="h-5 w-5 p-0"
            aria-label="Move up"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={index === total - 1}
            onClick={() => onMove(index, 'down')}
            className="h-5 w-5 p-0"
            aria-label="Move down"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={criterion.name}
              onChange={(e) => onChange({ ...criterion, name: e.target.value })}
              placeholder="Criterion name"
              className="flex-1"
            />
            <div className="flex items-center gap-1">
              <Label className="text-xs text-text-secondary whitespace-nowrap">Max pts</Label>
              <Input
                type="number"
                min={0}
                value={String(criterion.max_points)}
                onChange={(e) => onChange({ ...criterion, max_points: Number(e.target.value) })}
                className="w-20"
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(index)}
              aria-label="Remove criterion"
            >
              <Trash2 className="h-3.5 w-3.5 text-danger-text" />
            </Button>
          </div>

          {/* Levels */}
          <div className="space-y-2">
            {criterion.levels.map((lv, li) => (
              <div key={li} className="flex flex-wrap items-center gap-2">
                <Input
                  value={lv.label}
                  onChange={(e) => updateLevel(li, 'label', e.target.value)}
                  placeholder="Level label"
                  className="w-32"
                />
                <Input
                  type="number"
                  min={0}
                  value={String(lv.points)}
                  onChange={(e) => updateLevel(li, 'points', e.target.value)}
                  className="w-20"
                  placeholder="Pts"
                />
                <Input
                  value={lv.description}
                  onChange={(e) => updateLevel(li, 'description', e.target.value)}
                  placeholder="Description (optional)"
                  className="flex-1 min-w-0"
                />
                {criterion.levels.length > 1 && (
                  <Button variant="ghost" size="sm" onClick={() => removeLevel(li)}>
                    <Trash2 className="h-3 w-3 text-danger-text" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addLevel}>
              <Plus className="me-1 h-3 w-3" />
              Add level
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RubricTemplatesPage() {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');

  const [data, setData] = React.useState<RubricTemplate[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<RubricTemplate | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  // Form state
  const [name, setName] = React.useState('');
  const [criteria, setCriteria] = React.useState<RubricCriterion[]>([defaultCriterion()]);

  const fetchTemplates = React.useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      const res = await apiClient<RubricTemplatesResponse>(
        `/api/v1/gradebook/rubric-templates?${params.toString()}`,
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
    void fetchTemplates(page);
  }, [page, fetchTemplates]);

  const resetForm = () => {
    setName('');
    setCriteria([defaultCriterion()]);
  };

  const openCreate = () => {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  };

  const openEdit = (tpl: RubricTemplate) => {
    setEditTarget(tpl);
    setName(tpl.name);
    setCriteria(tpl.criteria.length > 0 ? tpl.criteria : [defaultCriterion()]);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), criteria };
      if (editTarget) {
        await apiClient(`/api/v1/gradebook/rubric-templates/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/gradebook/rubric-templates', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setDialogOpen(false);
      void fetchTemplates(page);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/v1/gradebook/rubric-templates/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      void fetchTemplates(page);
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const moveCriterion = (index: number, dir: 'up' | 'down') => {
    setCriteria((prev) => {
      const next = [...prev];
      const target = dir === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target] as RubricCriterion, next[index] as RubricCriterion];
      return next;
    });
  };

  const updateCriterion = (index: number, c: RubricCriterion) => {
    setCriteria((prev) => prev.map((x, i) => (i === index ? c : x)));
  };

  const removeCriterion = (index: number) => {
    setCriteria((prev) => prev.filter((_, i) => i !== index));
  };

  // Pagination controls
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('rubricTemplates')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            {tc('create')}
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={BookOpen} title={t('noRubricTemplates')} />
      ) : (
        <div className="space-y-3">
          {data.map((tpl) => (
            <div
              key={tpl.id}
              className="flex items-start justify-between gap-4 rounded-xl border border-border bg-surface p-5"
            >
              <div className="min-w-0 space-y-1">
                <p className="font-semibold text-text-primary">{tpl.name}</p>
                <p className="text-sm text-text-secondary">
                  {tpl.criteria.length} {t('criteria')}
                  {tpl.subject ? ` · ${tpl.subject.name}` : ''}
                </p>
                {tpl.criteria.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {tpl.criteria.slice(0, 5).map((c) => (
                      <span
                        key={c.id}
                        className="rounded-full bg-primary-100 px-2 py-0.5 text-xs text-primary-700"
                      >
                        {c.name || '—'} ({c.max_points}pts)
                      </span>
                    ))}
                    {tpl.criteria.length > 5 && (
                      <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary">
                        +{tpl.criteria.length - 5} more
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => openEdit(tpl)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDeleteId(tpl.id)}
                >
                  <Trash2 className="h-4 w-4 text-danger-text" />
                </Button>
              </div>
            </div>
          ))}
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? tc('edit') : tc('create')} {t('rubricTemplate')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <div>
              <Label htmlFor="rubric-name">{tc('name')}</Label>
              <Input
                id="rubric-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Essay Rubric"
              />
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>{t('criteria')}</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCriteria((prev) => [...prev, defaultCriterion()])}
                >
                  <Plus className="me-1 h-3 w-3" />
                  Add criterion
                </Button>
              </div>

              {criteria.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-tertiary">
                  No criteria yet. Add one above.
                </p>
              ) : (
                criteria.map((c, i) => (
                  <CriterionEditor
                    key={c.id}
                    criterion={c}
                    index={i}
                    total={criteria.length}
                    onChange={(updated) => updateCriterion(i, updated)}
                    onMove={moveCriterion}
                    onRemove={removeCriterion}
                  />
                ))
              )}
            </div>
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

      {/* Delete confirmation dialog */}
      <Dialog open={!!confirmDeleteId} onOpenChange={() => setConfirmDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tc('confirmDelete')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-secondary">{t('deleteRubricConfirm')}</p>
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
