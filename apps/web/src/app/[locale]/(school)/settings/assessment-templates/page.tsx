'use client';

import { BookOpen, Pencil, Plus, Trash2 } from 'lucide-react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@school/ui';

import { DataTable } from '@/components/data-table';
import { PageHeader } from '@/components/page-header';
import { apiClient } from '@/lib/api-client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectOption {
  id: string;
  name: string;
}

interface ListResponse<T> {
  data: T[];
}

interface AssessmentTemplate {
  id: string;
  name: string;
  category_id: string;
  category_name?: string;
  subject_id: string | null;
  subject?: { id: string; name: string } | null;
  max_score: number;
  rubric_template_id: string | null;
  rubric_template?: { id: string; name: string } | null;
  counts_toward_report_card: boolean;
  standard_ids: string[] | null;
}

interface TemplatesResponse {
  data: AssessmentTemplate[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssessmentTemplatesPage() {
  const t = useTranslations('gradebook');
  const tc = useTranslations('common');

  const [data, setData] = React.useState<AssessmentTemplate[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);

  // Filter state
  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);
  const [categories, setCategories] = React.useState<SelectOption[]>([]);
  const [rubricTemplates, setRubricTemplates] = React.useState<SelectOption[]>([]);
  const [subjectFilter, setSubjectFilter] = React.useState('all');

  // Dialog state
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<AssessmentTemplate | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = React.useState<string | null>(null);

  // Form state
  const [name, setName] = React.useState('');
  const [subjectId, setSubjectId] = React.useState('none');
  const [categoryId, setCategoryId] = React.useState('');
  const [maxScore, setMaxScore] = React.useState('100');
  const [rubricTemplateId, setRubricTemplateId] = React.useState('none');
  const [countsTowardReportCard, setCountsTowardReportCard] = React.useState(true);

  // Load option lists
  React.useEffect(() => {
    apiClient<ListResponse<SelectOption>>('/api/v1/subjects?pageSize=100&subject_type=academic')
      .then((res) => setSubjects(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<SelectOption>>('/api/v1/gradebook/assessment-categories?pageSize=100')
      .then((res) => setCategories(res.data))
      .catch(() => undefined);
    apiClient<ListResponse<SelectOption>>('/api/v1/gradebook/rubric-templates?pageSize=100')
      .then((res) => setRubricTemplates(res.data))
      .catch(() => undefined);
  }, []);

  const fetchTemplates = React.useCallback(async (p: number, subject: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (subject !== 'all') params.set('subject_id', subject);
      const res = await apiClient<TemplatesResponse>(
        `/api/v1/gradebook/assessment-templates?${params.toString()}`,
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
    void fetchTemplates(page, subjectFilter);
  }, [page, subjectFilter, fetchTemplates]);

  const resetForm = () => {
    setName('');
    setSubjectId('none');
    setCategoryId('');
    setMaxScore('100');
    setRubricTemplateId('none');
    setCountsTowardReportCard(true);
  };

  const openCreate = () => {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  };

  const openEdit = (tpl: AssessmentTemplate) => {
    setEditTarget(tpl);
    setName(tpl.name);
    setSubjectId(tpl.subject_id ?? 'none');
    setCategoryId(tpl.category_id);
    setMaxScore(String(tpl.max_score));
    setRubricTemplateId(tpl.rubric_template_id ?? 'none');
    setCountsTowardReportCard(tpl.counts_toward_report_card);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !categoryId) return;
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        subject_id: subjectId === 'none' ? null : subjectId,
        category_id: categoryId,
        max_score: Number(maxScore),
        rubric_template_id: rubricTemplateId === 'none' ? null : rubricTemplateId,
        counts_toward_report_card: countsTowardReportCard,
      };
      if (editTarget) {
        await apiClient(`/api/v1/gradebook/assessment-templates/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/gradebook/assessment-templates', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setDialogOpen(false);
      void fetchTemplates(page, subjectFilter);
    } catch {
      toast.error(tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiClient(`/api/v1/gradebook/assessment-templates/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      void fetchTemplates(page, subjectFilter);
    } catch {
      toast.error(tc('errorGeneric'));
    }
  };

  const columns = [
    {
      key: 'name',
      header: tc('name'),
      render: (row: AssessmentTemplate) => (
        <span className="font-medium text-text-primary">{row.name}</span>
      ),
    },
    {
      key: 'subject',
      header: t('subject'),
      render: (row: AssessmentTemplate) => (
        <span className="text-sm text-text-secondary">{row.subject?.name ?? '—'}</span>
      ),
    },
    {
      key: 'category',
      header: t('category'),
      render: (row: AssessmentTemplate) => (
        <span className="text-sm text-text-secondary">{row.category_name ?? '—'}</span>
      ),
    },
    {
      key: 'max_score',
      header: t('maxScore'),
      render: (row: AssessmentTemplate) => (
        <span className="font-mono text-sm text-text-secondary" dir="ltr">
          {row.max_score}
        </span>
      ),
    },
    {
      key: 'rubric',
      header: t('rubricTemplate'),
      render: (row: AssessmentTemplate) => (
        <span className="text-sm text-text-secondary">{row.rubric_template?.name ?? '—'}</span>
      ),
    },
    {
      key: 'counts',
      header: t('countsTowardReportCard'),
      render: (row: AssessmentTemplate) => (
        <span
          className={`text-sm ${row.counts_toward_report_card ? 'text-success-text' : 'text-text-tertiary'}`}
        >
          {row.counts_toward_report_card ? tc('yes') : tc('no')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: AssessmentTemplate) => (
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
            onClick={(e) => {
              e.stopPropagation();
              setConfirmDeleteId(row.id);
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
        title={t('assessmentTemplates')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            {tc('create')}
          </Button>
        }
      />

      {/* Subject filter */}
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={subjectFilter}
          onValueChange={(v) => {
            setSubjectFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder={t('subject')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            {subjects.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && data.length === 0 ? (
        <EmptyState icon={BookOpen} title={t('noAssessmentTemplates')} />
      ) : (
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
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? tc('edit') : tc('create')} {t('assessmentTemplate')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="tpl-name">{tc('name')}</Label>
              <Input
                id="tpl-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Mid-Term Exam"
              />
            </div>

            <div>
              <Label>
                {t('subject')} <span className="text-text-tertiary text-xs">(optional)</span>
              </Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Any subject" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any subject</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('category')}</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${t('category').toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="tpl-max-score">{t('maxScore')}</Label>
              <Input
                id="tpl-max-score"
                type="number"
                min={1}
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                className="w-32"
              />
            </div>

            <div>
              <Label>
                {t('rubricTemplate')} <span className="text-text-tertiary text-xs">(optional)</span>
              </Label>
              <Select value={rubricTemplateId} onValueChange={setRubricTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="No rubric" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No rubric</SelectItem>
                  {rubricTemplates.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="tpl-counts"
                checked={countsTowardReportCard}
                onChange={(e) => setCountsTowardReportCard(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-primary-600"
              />
              <Label htmlFor="tpl-counts" className="cursor-pointer">
                {t('countsTowardReportCard')}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tc('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim() || !categoryId}>
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
          <p className="text-sm text-text-secondary">{t('deleteTemplateConfirm')}</p>
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
