'use client';

import { Pencil, Plus, Send, Trash2 } from 'lucide-react';
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
  StatusBadge,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
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

interface AssessmentCategory {
  id: string;
  name: string;
  subject_id: string | null;
  year_group_id: string | null;
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected';
  rejection_reason: string | null;
  subject?: { id: string; name: string } | null;
  year_group?: { id: string; name: string } | null;
  in_use?: boolean;
}

interface CategoriesResponse {
  data: AssessmentCategory[];
  meta: { page: number; pageSize: number; total: number };
}

// ─── Status helpers ──────────────────────────────────────────────────────────

type StatusVariant = 'neutral' | 'warning' | 'success' | 'danger';

const STATUS_VARIANT_MAP: Record<AssessmentCategory['status'], StatusVariant> = {
  draft: 'neutral',
  pending_approval: 'warning',
  approved: 'success',
  rejected: 'danger',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssessmentCategoriesPage() {
  const t = useTranslations('teacherAssessments');
  const tc = useTranslations('common');

  // ── List state ──────────────────────────────────────────────────────────────

  const [data, setData] = React.useState<AssessmentCategory[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const PAGE_SIZE = 20;
  const [isLoading, setIsLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState('all');

  // ── Lookup data ─────────────────────────────────────────────────────────────

  const [subjects, setSubjects] = React.useState<SelectOption[]>([]);
  const [yearGroups, setYearGroups] = React.useState<SelectOption[]>([]);

  // ── Dialog state ────────────────────────────────────────────────────────────

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<AssessmentCategory | null>(null);
  const [saving, setSaving] = React.useState(false);

  // ── Form fields ─────────────────────────────────────────────────────────────

  const [name, setName] = React.useState('');
  const [subjectId, setSubjectId] = React.useState('');
  const [yearGroupId, setYearGroupId] = React.useState('');

  // ── Fetch helpers ───────────────────────────────────────────────────────────

  const fetchCategories = React.useCallback(async (p: number, status: string) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: String(PAGE_SIZE) });
      if (status !== 'all') params.set('status', status);
      const res = await apiClient<CategoriesResponse>(
        `/api/v1/gradebook/assessment-categories?${params.toString()}`,
      );
      const items = Array.isArray(res.data) ? res.data : [];
      setData(items);
      setTotal(res.meta?.total ?? items.length);
    } catch (err) {
      console.error('[AssessmentCategoriesPage]', err);
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchLookups = React.useCallback(async () => {
    try {
      const [subjectsRes, ygRes] = await Promise.all([
        apiClient<ListResponse<SelectOption>>(
          '/api/v1/subjects?pageSize=100&subject_type=academic',
        ),
        apiClient<ListResponse<SelectOption>>('/api/v1/year-groups?pageSize=100'),
      ]);
      setSubjects(subjectsRes.data);
      setYearGroups(ygRes.data);
    } catch (err) {
      console.error('[AssessmentCategoriesPage.lookups]', err);
    }
  }, []);

  React.useEffect(() => {
    void fetchLookups();
  }, [fetchLookups]);

  React.useEffect(() => {
    void fetchCategories(page, statusFilter);
  }, [page, statusFilter, fetchCategories]);

  // ── Form helpers ────────────────────────────────────────────────────────────

  const resetForm = React.useCallback(() => {
    setName('');
    setSubjectId('');
    setYearGroupId('');
  }, []);

  const openCreate = React.useCallback(() => {
    resetForm();
    setEditTarget(null);
    setDialogOpen(true);
  }, [resetForm]);

  const openEdit = React.useCallback((cat: AssessmentCategory) => {
    setEditTarget(cat);
    setName(cat.name);
    setSubjectId(cat.subject_id ?? '');
    setYearGroupId(cat.year_group_id ?? '');
    setDialogOpen(true);
  }, []);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name: name.trim() };
      if (subjectId) body.subject_id = subjectId;
      if (yearGroupId) body.year_group_id = yearGroupId;

      if (editTarget) {
        await apiClient(`/api/v1/gradebook/assessment-categories/${editTarget.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
      } else {
        await apiClient('/api/v1/gradebook/assessment-categories', {
          method: 'POST',
          body: JSON.stringify(body),
        });
      }
      setDialogOpen(false);
      toast.success(t('saveSuccess'));
      void fetchCategories(page, statusFilter);
    } catch (err) {
      console.error('[AssessmentCategoriesPage.save]', err);
      toast.error(tc('errorGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: AssessmentCategory) => {
    if (cat.in_use) return;
    try {
      await apiClient(`/api/v1/gradebook/assessment-categories/${cat.id}`, { method: 'DELETE' });
      toast.success(t('deleteSuccess'));
      void fetchCategories(page, statusFilter);
    } catch (err) {
      console.error('[AssessmentCategoriesPage.delete]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  const handleSubmitForApproval = async (cat: AssessmentCategory) => {
    try {
      await apiClient(`/api/v1/gradebook/assessment-categories/${cat.id}/submit`, {
        method: 'POST',
      });
      toast.success(t('submitSuccess'));
      void fetchCategories(page, statusFilter);
    } catch (err) {
      console.error('[AssessmentCategoriesPage.submit]', err);
      toast.error(tc('errorGeneric'));
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const canEdit = (cat: AssessmentCategory) => cat.status === 'draft' || cat.status === 'rejected';

  const canDelete = (cat: AssessmentCategory) =>
    (cat.status === 'draft' || cat.status === 'rejected') && !cat.in_use;

  const canSubmit = (cat: AssessmentCategory) => cat.status === 'draft';

  const statusLabel = (status: AssessmentCategory['status']): string => {
    const map: Record<AssessmentCategory['status'], string> = {
      draft: t('draft'),
      pending_approval: t('pendingApproval'),
      approved: t('approved'),
      rejected: t('rejected'),
    };
    return map[status];
  };

  // ── Columns ─────────────────────────────────────────────────────────────────

  const columns = [
    {
      key: 'name',
      header: t('categoryName'),
      render: (row: AssessmentCategory) => (
        <span className="font-medium text-text-primary">{row.name}</span>
      ),
    },
    {
      key: 'subject',
      header: t('subject'),
      render: (row: AssessmentCategory) => (
        <span className="text-text-secondary">{row.subject?.name ?? t('allSubjects')}</span>
      ),
    },
    {
      key: 'yearGroup',
      header: t('yearGroup'),
      render: (row: AssessmentCategory) => (
        <span className="text-text-secondary">{row.year_group?.name ?? t('allYearGroups')}</span>
      ),
    },
    {
      key: 'status',
      header: t('status'),
      render: (row: AssessmentCategory) => (
        <div className="flex items-center gap-2">
          <StatusBadge status={STATUS_VARIANT_MAP[row.status]} dot>
            {statusLabel(row.status)}
          </StatusBadge>
          {row.status === 'rejected' && row.rejection_reason && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="danger" className="cursor-help text-xs">
                    !
                  </Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">{row.rejection_reason}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: tc('actions'),
      render: (row: AssessmentCategory) => (
        <div className="flex items-center gap-1">
          {canSubmit(row) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void handleSubmitForApproval(row);
              }}
              title={t('submitForApproval')}
            >
              <Send className="h-4 w-4 text-info-text" />
            </Button>
          )}
          {canEdit(row) && (
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
          )}
          {canDelete(row) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                void handleDelete(row);
              }}
            >
              <Trash2 className="h-4 w-4 text-danger-text" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  // ── Toolbar ─────────────────────────────────────────────────────────────────

  const toolbar = (
    <div className="flex flex-wrap items-center gap-3">
      <Select
        value={statusFilter}
        onValueChange={(v) => {
          setStatusFilter(v);
          setPage(1);
        }}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder={t('filterByStatus')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t('allStatuses')}</SelectItem>
          <SelectItem value="draft">{t('draft')}</SelectItem>
          <SelectItem value="pending_approval">{t('pendingApproval')}</SelectItem>
          <SelectItem value="approved">{t('approved')}</SelectItem>
          <SelectItem value="rejected">{t('rejected')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('categories')}
        actions={
          <Button onClick={openCreate}>
            <Plus className="me-2 h-4 w-4" />
            {t('createCategory')}
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data}
        toolbar={toolbar}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        keyExtractor={(row) => row.id}
        isLoading={isLoading}
      />

      {/* ── Create / Edit Dialog ──────────────────────────────────────────── */}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? t('editCategory') : t('createCategory')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="cat-name">{t('categoryName')}</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('categoryName')}
                className="text-base"
              />
            </div>

            <div>
              <Label htmlFor="cat-subject">{t('subjectScope')}</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger id="cat-subject" className="w-full">
                  <SelectValue placeholder={t('allSubjects')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('allSubjects')}</SelectItem>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="cat-yg">{t('yearGroupScope')}</Label>
              <Select value={yearGroupId} onValueChange={setYearGroupId}>
                <SelectTrigger id="cat-yg" className="w-full">
                  <SelectValue placeholder={t('allYearGroups')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">{t('allYearGroups')}</SelectItem>
                  {yearGroups.map((yg) => (
                    <SelectItem key={yg.id} value={yg.id}>
                      {yg.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? tc('loading') : t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
