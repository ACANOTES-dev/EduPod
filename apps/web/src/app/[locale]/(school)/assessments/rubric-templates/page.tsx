'use client';

import { BookOpen, Plus, Send, Trash2 } from 'lucide-react';
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
  EmptyState,
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

interface SubjectOption {
  id: string;
  name: string;
}

type RubricStatus = 'draft' | 'pending' | 'approved' | 'rejected';

interface RubricTemplate {
  id: string;
  name: string;
  status: RubricStatus;
  criteria: RubricCriterion[];
  subject?: { id: string; name: string } | null;
}

interface RubricTemplatesResponse {
  data: RubricTemplate[];
  meta: { page: number; pageSize: number; total: number };
}

interface ListResponse<T> {
  data: T[];
}

// ─── Status Helpers ──────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<RubricStatus, 'secondary' | 'warning' | 'success' | 'danger'> = {
  draft: 'secondary',
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
};

const STATUS_LABELS: Record<RubricStatus, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

// ─── Default criterion for Phase 3 create ────────────────────────────────────

const DEFAULT_CRITERIA: RubricCriterion[] = [
  {
    id: 'c1',
    name: 'Quality',
    max_points: 100,
    levels: [
      { label: 'Excellent', points: 100, description: 'Outstanding work' },
      { label: 'Good', points: 75, description: 'Above average' },
      { label: 'Satisfactory', points: 50, description: 'Meets expectations' },
    ],
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RubricTemplatesPage() {
  const t = useTranslations('teacherAssessments');
  const tc = useTranslations('common');

  const [data, setData] = React.useState<RubricTemplate[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  // Subjects for the create dialog
  const [subjects, setSubjects] = React.useState<SubjectOption[]>([]);

  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);
  const [submittingId, setSubmittingId] = React.useState<string | null>(null);

  // Form state (Phase 3: name + subject only)
  const [name, setName] = React.useState('');
  const [subjectId, setSubjectId] = React.useState('');

  // ─── Data fetching ──────────────────────────────────────────────────────────

  React.useEffect(() => {
    apiClient<ListResponse<SubjectOption>>('/api/v1/subjects?pageSize=100&subject_type=academic')
      .then((res) => setSubjects(res.data))
      .catch((err) => {
        console.error('[RubricTemplatesPage] subjects', err);
      });
  }, []);

  const fetchTemplates = React.useCallback(async (p: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      const res = await apiClient<RubricTemplatesResponse>(
        `/api/v1/gradebook/rubric-templates?${params.toString()}`,
      );
      setData(res.data);
      setTotal(res.meta.total);
    } catch (err) {
      console.error('[RubricTemplatesPage]', err);
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void fetchTemplates(page);
  }, [page, fetchTemplates]);

  // ─── Actions ────────────────────────────────────────────────────────────────

  const resetForm = () => {
    setName('');
    setSubjectId('');
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        criteria: DEFAULT_CRITERIA,
      };
      if (subjectId) {
        body.subject_id = subjectId;
      }
      await apiClient('/api/v1/gradebook/rubric-templates', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setDialogOpen(false);
      void fetchTemplates(page);
    } catch (err) {
      console.error('[RubricTemplatesPage]', err);
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
    } catch (err) {
      console.error('[RubricTemplatesPage]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const handleSubmitForApproval = async (id: string) => {
    setSubmittingId(id);
    try {
      await apiClient(`/api/v1/gradebook/rubric-templates/${id}/submit`, {
        method: 'POST',
      });
      void fetchTemplates(page);
    } catch (err) {
      console.error('[RubricTemplatesPage]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setSubmittingId(null);
    }
  };

  // ─── Pagination ─────────────────────────────────────────────────────────────

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // ─── Render ─────────────────────────────────────────────────────────────────

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

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl bg-surface-secondary" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState icon={BookOpen} title={t('noRubricTemplates')} />
      ) : (
        <>
          {/* Card grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((tpl) => {
              const canDelete = tpl.status === 'draft' || tpl.status === 'rejected';
              const canSubmit = tpl.status === 'draft';

              return (
                <div
                  key={tpl.id}
                  className="flex flex-col justify-between rounded-xl border border-border bg-surface p-5"
                >
                  <div className="space-y-2">
                    {/* Header row: name + status */}
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-text-primary line-clamp-2">{tpl.name}</h3>
                      <Badge variant={STATUS_VARIANT[tpl.status]} className="shrink-0">
                        {STATUS_LABELS[tpl.status]}
                      </Badge>
                    </div>

                    {/* Meta */}
                    <p className="text-sm text-text-secondary">
                      {tpl.criteria.length} {t('criteria')}
                      {tpl.subject ? ` \u00B7 ${tpl.subject.name}` : ''}
                    </p>

                    {/* Criteria preview chips */}
                    {tpl.criteria.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tpl.criteria.slice(0, 3).map((c) => (
                          <span
                            key={c.id}
                            className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary-700"
                          >
                            {c.name || '\u2014'} ({c.max_points} {t('pts')})
                          </span>
                        ))}
                        {tpl.criteria.length > 3 && (
                          <span className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs text-text-secondary">
                            +{tpl.criteria.length - 3} {t('more')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
                    {canSubmit && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={submittingId === tpl.id}
                        onClick={() => void handleSubmitForApproval(tpl.id)}
                      >
                        <Send className="me-1.5 h-3.5 w-3.5" />
                        {submittingId === tpl.id ? tc('loading') : t('submitForApproval')}
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(tpl.id)}>
                        <Trash2 className="h-4 w-4 text-danger-text" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

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
        </>
      )}

      {/* Create dialog (Phase 3: name + subject only) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {tc('create')} {t('rubricTemplate')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="rubric-name">{tc('name')}</Label>
              <Input
                id="rubric-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('eGEssayRubric')}
              />
            </div>
            <div>
              <Label>{t('subject')}</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('selectSubjectOptional')} />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={saving || !name.trim()}>
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
